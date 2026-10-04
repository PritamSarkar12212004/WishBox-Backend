# Wishbox Backend

Express 5 + TypeScript + MongoDB API for Wishbox.

## Quick start

```bash
npm install
cp .env.example .env   # then set MONGODB_URI
npm run dev            # http://localhost:5000
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Watch mode dev server (`tsx watch`)            |
| `npm run build`     | Compile TypeScript to `dist/`                  |
| `npm start`         | Run the compiled server (`node dist/server.js`)|
| `npm run typecheck` | Type-check without emitting                    |
| `npm test`          | Test suite (HTTP layer, auth flow, Twilio)     |

## Folder structure

```
src/
├── config/       env validation, logger, database connection
├── middleware/   request logging, error handling, rate limiting, auth guard
├── shared/       API response format, error classes, JWT helpers
├── routes/       route definitions (health + feature router mounting)
├── modules/      one folder per feature (auth, user, …)
├── consts/       shared constants (HTTP statuses, error codes, phone rules)
├── services/     external integrations (WhatsApp, Shiprocket)
├── types/        ambient type augmentation (Express Request)
├── app.ts        Express app wiring
└── server.ts     bootstrap + graceful shutdown
```

## Conventions

**Environment** – every variable is validated by zod in `config/env.ts`.
The process exits immediately with a readable list of problems if anything is
missing or malformed, so `env` is always safe to use. Add new variables to
both `env.ts` and `.env.example`.

**Response format** – every endpoint returns the same envelope:

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": { },
  "error": null,
  "timestamp": "2026-10-04T15:32:32.189Z",
  "requestId": "9f0c…"
}
```

Use `sendSuccess(res, data, { message, statusCode, meta })` for success and
throw an error from `shared/errors.ts` for failures:

```ts
import { asyncHandler, sendSuccess, NotFoundError } from '../shared/index.js';

router.get('/widgets/:id', asyncHandler(async (req, res) => {
  const widget = await Widget.findById(req.params.id);
  if (!widget) throw new NotFoundError('Widget not found');
  sendSuccess(res, widget);
}));
```

**Errors** – `AppError` subclasses carry a status code and a stable `code`
(`NOT_FOUND`, `VALIDATION_ERROR`, …). The global handler in
`middleware/errorHandler.middleware.ts` also translates `ZodError`, Mongoose
validation/cast errors, duplicate-key errors (11000), malformed JSON and JWT
errors. Internal details are hidden when `NODE_ENV=production`.

**Rate limiting** – `globalRateLimiter` is applied to all routes.
`authRateLimiter` is stricter and should be added to login/OTP routes.

**Request ids** – every request gets an id, returned in the `x-request-id`
header and in the response body, and included in every log line.

## Endpoints

| Method | Path                     | Auth | Description                              |
| ------ | ------------------------ | ---- | ---------------------------------------- |
| GET    | `/`                      | –    | Service banner                           |
| GET    | `/health`                | –    | Health probe (200 ok, 503 if DB is down) |
| GET    | `/api/v1/`               | –    | API index                                |
| GET    | `/api/v1/health`         | –    | Health probe under the API prefix        |
| POST   | `/api/v1/auth/otp/request` | –  | Send a login code                        |
| POST   | `/api/v1/auth/otp/verify`  | –  | Verify the code, create/find the user, issue JWTs |
| POST   | `/api/v1/auth/refresh`     | –  | Exchange a refresh token for a new pair  |
| POST   | `/api/v1/auth/logout`      | ✅ | Retire this device (or every device)     |
| GET    | `/api/v1/auth/me`          | ✅ | Signed-in profile (alias of `/users/me`) |
| GET    | `/api/v1/users/me`         | ✅ | Signed-in profile                        |
| PATCH  | `/api/v1/users/me`         | ✅ | Update the display name                  |

## Authentication

Passwordless: the shopper gives a name and WhatsApp number, receives a
six-digit code, and gets a JWT pair back. This is the gate behind every
account-connected action in the storefront (wishlist, cart, orders, profile).

```
POST /api/v1/auth/otp/request  { "phone": "9876543210", "name": "Ananya" }
POST /api/v1/auth/otp/verify   { "phone": "9876543210", "code": "483920", "name": "Ananya" }
  -> { user, accessToken, refreshToken, expiresInSeconds }
```

Then send the access token on every gated request:

```
Authorization: Bearer <accessToken>
```

**Rules that mirror the storefront** (`src/modules/auth/lib/otp.ts`):
numbers are normalised to ten digits (a `+91` prefix is accepted and stripped),
must start with 6-9, and the code is six digits. Resend is blocked for 30s.

**Security properties**
- Codes are stored as bcrypt hashes, never in plain text, and are single-use.
- Wrong guesses are counted; after `OTP_MAX_ATTEMPTS` the code is burned.
- A TTL index deletes expired challenges automatically.
- Refresh tokens are stored hashed and rotated on every use, so a replayed
token fails. `AUTH_MAX_SESSIONS` caps how many devices stay signed in.
- Access tokens are short lived (`JWT_EXPIRES_IN`, default 15m).
- `OTP_DEBUG_RETURN_CODE=true` echoes the code in the response. It is a local
development convenience and boot **fails** if it is on in production.

### OTP delivery

`WHATSAPP_PROVIDER` selects the transport:

| Value     | Behaviour                                                        |
| --------- | ---------------------------------------------------------------- |
| `console` | **Default.** Prints the code to the log. No account needed.      |
| `twilio`  | Sends a real WhatsApp or SMS message via the Twilio Messages API.|

For Twilio, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and the sender for
your channel (`TWILIO_WHATSAPP_FROM`, e.g. `whatsapp:+14155238886` for the
sandbox, or `TWILIO_SMS_FROM`). Env validation refuses to boot if they are
missing. Adding another gateway (Meta WhatsApp Cloud API, MSG91, …) means
implementing `WhatsAppProvider` in `src/services/whatsapp/` and extending the
enum. Files: `whatsapp.types.ts` (the interface), `console.provider.ts`,
`twilio.provider.ts`.

## Adding a feature module

`routes/index.ts` aggregates the API, and every feature lives in
`src/modules/<feature>/`:

```
src/modules/<feature>/
├── <feature>.model.ts       Mongoose schema + types
├── <feature>.controller.ts  HTTP layer only
├── <feature>.service.ts     business logic
├── <feature>.validation.ts  zod schemas
└── <feature>.routes.ts      paths + middleware
```

The `auth` and `user` modules are the reference implementation. Then register
the router in `src/routes/index.ts`:

```ts
import { wishlistRouter } from '../modules/wishlist/wishlist.routes.js';
apiRouter.use('/wishlist', wishlistRouter);
```

Gate it for signed-in shoppers with the auth middleware:

```ts
import { requireAuth, requireRole } from '../../middleware/index.js';

router.get('/', requireAuth, listWishlist);
router.delete('/admin/:id', requireAuth, requireRole('admin'), removeEntry);
```

`optionalAuth` is available too, for public routes that show extra data once
the shopper is signed in.

> Imports use explicit `.js` extensions because the project is ESM
> (`"type": "module"` + `NodeNext` resolution).
