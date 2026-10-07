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
| `npm test`          | Test suite (HTTP layer, auth flow, gateway, admin API) |
| `npm run db:check`  | Diagnose the MongoDB connection layer by layer |
| `npm run admin:seed`| Fill the admin panel's collections with a seeded year of history |

## Folder structure

```
src/
├── config/       env validation, logger, database connection
├── middleware/   request logging, error handling, rate limiting, auth guard
├── shared/       API response format, error classes, JWT helpers, axios client
├── routes/       route definitions (health + feature router mounting)
├── modules/      one folder per feature (auth, user, addresses, products, categories, uploads, admin)
├── consts/       shared constants (HTTP statuses, error codes, phone rules)
├── services/     external integrations (WhatsApp gateway, Cloudinary, Shiprocket)
├── types/        ambient type augmentation (Express Request)
├── app.ts        Express app wiring
└── server.ts     bootstrap + graceful shutdown
```

## API reference

Every auth endpoint with real captured request/response examples and copy-paste
`curl` recipes: [`docs/auth-api.md`](docs/auth-api.md).

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
| GET    | `/api/v1/auth/me`          | ✅ | Signed-in profile (alias of `/me`)       |
| GET    | `/api/v1/me`               | ✅ | Signed-in profile                        |
| PATCH  | `/api/v1/me`               | ✅ | Update the display name                  |
| GET    | `/api/v1/users/me`         | ✅ | Signed-in profile (alias of `/me`)       |
| PATCH  | `/api/v1/users/me`         | ✅ | Update the display name (alias of `/me`) |
| GET    | `/api/v1/addresses`        | ✅ | The shopper's address book, newest first |
| POST   | `/api/v1/addresses`        | ✅ | Save a delivery address (201)            |
| PATCH  | `/api/v1/addresses/:id`    | ✅ | Change one or more fields of an address  |
| DELETE | `/api/v1/addresses/:id`    | ✅ | Remove an address                        |
| GET    | `/api/v1/products`         | –  | Published products, with filters, sorting and paging |
| GET    | `/api/v1/products/:slug`   | –  | One published product (`404` for a draft) |
| GET    | `/api/v1/categories`       | –  | Categories with live product counts      |
| GET    | `/api/v1/categories/:slug` | –  | One category                             |
| POST   | `/api/v1/admin/products`   | 🛡️ | Create a product (201)                   |
| GET    | `/api/v1/admin/products`   | 🛡️ | Every product, drafts included           |
| GET    | `/api/v1/admin/products/:slug` | 🛡️ | One product, draft or published      |
| PATCH  | `/api/v1/admin/products/:slug` | 🛡️ | Partial product edit                 |
| DELETE | `/api/v1/admin/products/:slug` | 🛡️ | Delete a product, and its images     |
| POST   | `/api/v1/admin/categories` | 🛡️ | Create a category (201)                  |
| PATCH  | `/api/v1/admin/categories/:slug` | 🛡️ | Rename or re-order a category     |
| DELETE | `/api/v1/admin/categories/:slug` | 🛡️ | Delete a category (`409` while in use) |
| GET    | `/api/v1/admin/uploads/status` | 🛡️ | Whether the server can sign an upload |
| POST   | `/api/v1/admin/uploads`    | 🛡️ | Signed upload / re-host a URL (201)      |
| DELETE | `/api/v1/admin/uploads?publicId=…` | 🛡️ | Delete a stored asset           |
| GET    | `/api/v1/admin/session`    | 🛡️ | Admin identity + confirmation of access  |
| GET    | `/api/v1/admin/dataset`    | 🛡️ | Everything the admin panel charts, in one call |
| GET    | `/api/v1/admin/settings`   | 🛡️ | Store settings                           |
| PATCH  | `/api/v1/admin/settings`   | 🛡️ | Merge a partial settings change          |
| PATCH  | `/api/v1/admin/orders/:id` | 🛡️ | Approve, ship, cancel or refund an order |
| PATCH  | `/api/v1/admin/returns/:id`| 🛡️ | Move a return through its queue          |
| PATCH  | `/api/v1/admin/reviews/:id`| 🛡️ | Publish/unpublish a review, post or clear a reply |
| DELETE | `/api/v1/admin/reviews/:id`| 🛡️ | Remove a review                          |

✅ = `Authorization: Bearer <accessToken>` · 🛡️ = the same, **plus** admin access.

`/me` is the customer profile's short path (`/users/me` and `/auth/me` are
kept as aliases, same handlers).

## Customer profile API

### `GET /api/v1/me`, `PATCH /api/v1/me`

`GET` returns the signed-in shopper (`id`, `name`, `phone`, `role`, timestamps).
`PATCH` currently edits the display name only - the phone is read-only, because
changing it would need it verified again:

```bash
curl -X PATCH http://localhost:5000/api/v1/me \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"name":"Ananya S. Sharma"}'
```

### `/api/v1/addresses`

Addresses are stored as **parts**, not one formatted string, because the parts
are what a form edits and what a courier integration consumes. **Both address
lines are required** - a building number alone does not get a courier to a door.

```bash
curl -X POST http://localhost:5000/api/v1/addresses \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"address1":"12B, Sunrise Apartments","address2":"Dharampeth, Near Ganesh Mandir","city":"Nagpur","state":"Maharashtra","pincode":"440001"}'
```

The rules the API enforces:

| Field      | Rule                                                              |
| ---------- | ----------------------------------------------------------------- |
| `address1` | 4-120 chars                                                       |
| `address2` | **required**, 3-120 chars (the area, landmark or street)          |
| `city`     | 2-60 chars                                                        |
| `state`    | must be an Indian state/UT; canonicalised (`maharashtra` → `Maharashtra`, `jammu & kashmir` → `Jammu and Kashmir`) |
| `pincode`  | `/^[1-9][0-9]{5}$/` — six digits, never starting with `0`          |

An unknown key is a `422` rather than something quietly stored. Every query is
scoped by the signed-in shopper's `userId`, so an id belonging to somebody else
is a `404` indistinguishable from a missing one. A malformed id is a `422`, and
a book is capped at **10 addresses** (`409` past that).

## Product catalogue API

Products are what a shopper sees, so the split is by audience rather than by
verb: **reading is public** (`/products`, `/categories`) and **writing is admin
only** (`/admin/products`, `/admin/categories`, `/admin/uploads`). A product's
public id is its **slug**, `id` in every response, and the document mirrors the
storefront's `CatalogProduct` field for field - so a product from the API drops
straight into the existing cards and PDP.

```bash
# anyone can browse
curl 'http://localhost:5000/api/v1/products?category=paper-craft&sort=price-asc&limit=12'

# only an admin can add one
curl -X POST http://localhost:5000/api/v1/admin/products \
  -H "authorization: Bearer $ADMIN_ACCESS" -H 'content-type: application/json' \
  -d '{
        "name":"Premium Handmade Decorative Paper Sheets",
        "sku":"WB-PAPER-001",
        "brand":"PaperCraft",
        "category":"paper-craft",
        "price":249,
        "mrp":399,
        "badge":"BESTSELLER",
        "stock":8,
        "image":"https://res.cloudinary.com/dftt4ow6q/image/upload/v1789112613/wishbox/paper.jpg",
        "description":"Hand-pressed decorative paper with a smooth matte finish.",
        "highlights":["Premium handmade quality paper","Smooth, even matte texture"]
      }'
```

The rules the API enforces:

| Field | Rule |
| ----- | ---- |
| `name` | 2-140 chars; the `slug` is derived from it when one is not given |
| `slug` | optional, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique - renaming it retires the old URL |
| `sku` | uppercase letters, numbers and hyphens, unique |
| `category` | must be an **existing category slug** (`404` otherwise) |
| `price` / `mrp` | whole rupees, ₹1+; `mrp` may never sit below `price` |
| `image` / `hoverImage` / `gallery` / `beforeImage` / `afterImage` | a hosted `http(s)` URL or an image data URI; `hoverImage` falls back to `image` |
| `rating` | 0-5 (`reviewCount` is an integer) |
| `available` | in stock; drives the out-of-stock treatment |
| `hidden` | unpublished: absent from the public listing, search **and** its own product page (`404` to a shopper, `200` to an admin) |
| `highlights` | up to 12 strings |
| `specs` | `height`, `width`, `gsm`, `packaging` (`Sealed` \| `Standard`) |
| `offer` | `code` (normalised to uppercase) + `label` |

On `PATCH`, an absent field is left alone and **`null` clears it** - that is how a
badge, offer, specification block or extra image is removed. The MRP rule is
re-checked against the *edited* product, so widening MRP and dropping the price
are both allowed on their own, while ending up above the list price is a `422`
that writes nothing. An unknown key in the body is a `422` rather than something
quietly stored.

Listing filters: `category`, `search` (name, brand or SKU - regex characters are
treated as text), `badge`, `available`, `sort` (`featured`, `newest`, `price-asc`,
`price-desc`, `name`), `page`, `limit` (max 60). Pagination is reported in `meta`:

```jsonc
{ "data": [ /* products */ ], "meta": { "total": 42, "page": 2, "limit": 12, "pages": 4 } }
```

`GET /api/v1/admin/products` adds `visibility=published|hidden|all` (default
`published`); the public route does not accept it at all.

Categories are their own small resource, with the slug as the id
(`{"label":"Paper & Craft"}` becomes `paper-craft`). A category cannot be
deleted while products still point at it - that is a `409` naming the count, so
the shop can never render a product filed under a category that no longer
exists.

## Image storage (Cloudinary)

Two paths, deliberately different:

- **Unsigned, from the browser** — the admin product editor posts straight to
  Cloudinary with an unsigned upload preset (the storefront's `lib/cloudinary.ts`),
  so no secret is ever in the bundle. This is how product photos are uploaded.
- **Signed, from the server** — `src/services/cloudinary/` does the work a
  browser cannot: re-hosting an existing URL, forcing a public id, and deleting
  an asset when its record goes away. `POST /api/v1/admin/uploads` (admin only)
  exposes that; `GET /api/v1/admin/uploads/status` says whether it can sign right
  now, and which key is missing if it cannot.

```
src/services/cloudinary/
├── config.ts            every setting, resolved once from validated env
├── signature.ts         request signing (the API secret never leaves the server)
├── client.ts            the HTTP calls, with timeout and retry
├── urls.ts              delivery URL -> public id, so a record can be cleaned up
├── cloudinary.errors.ts the two failures the service can throw
├── types.ts             request/response shapes
└── index.ts             the module's public surface
```

Uploading through `POST /admin/uploads` sends a *reference* to an image (a hosted
URL Cloudinary fetches itself, or a data URI) rather than bytes, because the JSON
body is capped at 1 MB. Larger files go up **unsigned** from the admin editor's
drop zone, which never needs the secret.

```ts
import { destroyImage, isConfigured, storeImage } from './services/cloudinary/index.js';

if (isConfigured()) {
  const asset = await storeImage({ file: dataUriOrUrl, folder: 'refunds' });
  // …save asset.secureUrl on the record
}

await destroyImage(asset.publicId);
```

Config, all declared in `src/config/env.ts` and surfaced as `env.cloudinary`:

```
CLOUDINARY_CLOUD_NAME=dftt4ow6q
CLOUDINARY_API_KEY=669666261897963
CLOUDINARY_KEY_NAME=Cloud_Image
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=wishbox
```

`CLOUDINARY_API_SECRET` is the one credential that is **not** required to boot.
`cloudinaryConfig.isConfigured` is false until the cloud name, key and secret are
all present, so a half-configured environment refuses a signed operation with a
**503 that names the missing key** rather than writing a broken URL. `storeImage()`
throws that up front; callers that treat storage as optional check
`isConfigured()` first. Because the admin editor uploads unsigned, the storefront
keeps working with the secret blank - set it and signed uploads *and* automatic
image cleanup switch on, with no code change.

Failure handling mirrors the messaging gateway, because the caller can act on
exactly one of the two: a **refusal** (4xx/5xx) is thrown immediately with
Cloudinary's own message — "Upload preset not found" is the whole fix — while an
**unreachable** host is retried once and then reported as a 502. A delete that
answers `not found` is returned, not thrown: the asset is gone, which is what was
asked for.

**Product images are cleaned up for you.** Whenever a product is edited or
deleted, any image URL that was on it before and is not on it afterwards is
handed to `removeProductImages()`, which recovers the public id from the delivery
URL and destroys it. Two rules make that safe to run mid-request: it never throws
(the write is already persisted), and it only ever touches assets in *this* cloud
— a pasted Unsplash link is simply not ours. With no API secret the whole step is
a silent no-op, which is why the shop keeps working either way.

## Admin panel API

Who gets the panel is configuration, not data. Add the WhatsApp numbers to
`ADMIN_PHONES` (comma separated, `+91` optional):

```
ADMIN_PHONES=7796419792,9811111111
```

Signing in with one of those numbers promotes the account to `role: "admin"` —
before the tokens are minted, so the very first token is already stamped. It is
re-checked on every authenticated request, so a number added to `.env` takes
effect on that account's next request and cannot be self-granted through the API.
An empty list locks the panel for everyone.

`requireAdmin` (in `src/modules/admin/admin.access.ts`) gates every `/admin`
route, reading the role from the database rather than from the token — a
promotion applies immediately instead of at the next token refresh.

```
GET    /api/v1/admin/session            -> { user, isAdmin }
GET    /api/v1/admin/dataset            -> { orders, customers, returns, reviews, coupons, restocks }
PATCH  /api/v1/admin/orders/:id         { status, courier, trackingId, cancellationReason, refundScreenshot }
PATCH  /api/v1/admin/returns/:id        { status }
PATCH  /api/v1/admin/reviews/:id        { status, reply: { message } | null }
DELETE /api/v1/admin/reviews/:id
GET    /api/v1/admin/settings
PATCH  /api/v1/admin/settings           { any subset of the settings }
```

**The server owns the audit trail.** `approvedAt`, `cancelledAt`, `refundedAt`
and `approvedBy` are stamped by the API — a client that sends them gets a 422
rather than a backdated approval. The service also refuses an impossible state:
a courier on an unapproved order, a refund on an order that is not cancelled, a
cancellation with no reason.

**Where the data comes from.** Orders, customers, returns, reviews, coupons and
restocks are ordinary MongoDB collections (`AdminOrder`, `AdminCustomer`, …)
served exactly as any other record. There is no checkout yet, so a fresh database
would leave every dashboard flat: `npm run admin:seed` fills them with a seeded
year of history (fixed seed, so two runs agree). It clears those six collections
first and never touches `users`, so accounts survive a reseed. The product
catalogue is deliberately **not** here — it lives in the storefront's own store.


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

### Login code delivery

There is exactly one transport: **Wishbox's own messaging gateway**. It is a
template-based service — the code is injected into an approved WhatsApp
template rather than a free-text body, and every template carries a header
image. `sendOtpCode(phone, code)` is the whole public surface; a new transport
would mean adding an adapter beside `gateway/provider.ts`, not a config switch.

```
src/services/whatsapp/gateway/
├── config.ts        every setting, resolved once from validated env
├── phone.ts         number formatting for this gateway
├── templates.ts     template ids + placeholder builders
├── client.ts        the HTTP call, with timeout and retry
├── provider.ts      the login-code transport
├── notifications.ts fire-and-forget templates (booking, admin)
├── types.ts         request/response shapes
└── index.ts         the module's public surface
```

`SMS_API_TOKEN` is required — env validation refuses to boot without it,
because there is no fallback transport and a missing token would otherwise
surface as a 500 at the first login. Everything else has a working default:
`SMS_API_URL`, `SMS_OTP_TEMPLATE_ID`, `SMS_SIGNUP_TEMPLATE_ID`,
`SMS_BOOKING_TEMPLATE_ID`, `SMS_SUPPORT_EMAIL` / `SMS_SUPPORT_INSTA` /
`SMS_SUPPORT_PHONE`, `SMS_MEDIA_URL`, `SMS_TIMEOUT_MS` (30s — the gateway's
free tier cold-starts), `SMS_MAX_ATTEMPTS`.

Notes worth knowing before touching this module:

- The token lives in `SMS_API_TOKEN`, never in source. It is a bearer
credential — rotate it if it has ever been shared.
- `SMS_API_VARIABLES_KEY` naming the code placeholder must match the approved
 template (`otpdev` for the OTP one). A mismatch sends a message with an empty
 code slot instead of failing, so it is worth checking after any template
 change.
- `SMS_MEDIA_URL` must be a public absolute URL; the gateway rejects a template
whose header media is missing or relative.
- Retries are bounded (`SMS_MAX_ATTEMPTS`), because a cold start on the free
tier can hang for 30s+ and a login must not hang with it.
- Before trusting a new `SMS_API_URL` (a restarted local tunnel, say), POST a
 body with an empty `to`. A real gateway answers with a validation error such
 as `"to" is not allowed to be empty`; a generic `200` means the address is
 not the messaging service and every send would be silently "successful".
- A rejected login code throws a `502 WHATSAPP_DELIVERY_FAILED`. The gateway's
raw response body stays in the logs and is never echoed to the client.

#### Business notifications

`sendTemplateNotification()` covers the non-login flows (booking
confirmation, admin alerts). It **never throws** on a gateway failure — it is
called after a business action has already succeeded, so a dead gateway must
not fail that action. The caller supplies the template's placeholder
`variables`, since those keys belong to the template, not to the transport.

`sendSignupWelcome()` is the same thing for the sign-in flow: after
`POST /auth/otp/verify` returns success, the shopper gets one extra template
message (`SMS_SIGNUP_TEMPLATE_ID`) carrying the storefront's support contacts
(`SMS_SUPPORT_EMAIL`, `SMS_SUPPORT_INSTA`, `SMS_SUPPORT_PHONE`).

It runs **fire-and-forget** — the session is already issued when it is called,
so a slow gateway adds no latency to a login and a failing one cannot fail it.
It goes to `SMS_API_URL`, never to the booking override.

It is sent on **every** successful verify, for a returning shopper as well as a
brand-new one. Despite the `SMS_SIGNUP_*` / `sendSignupWelcome` naming (kept so
the env var does not churn), it is not limited to account creation — change
that deliberately if the product decision changes.

The template is a *dev* one, so the gateway stores no media for it: the header
image must be supplied on every send via `SMS_MEDIA_URL`. Its `phoneSupport`
placeholder is rendered after a hard-coded `+91`, so give it digits only.

## Outbound HTTP

Every third-party API call goes through the shared axios instance in
`src/shared/httpClient.ts`, so timeouts and error handling have one home:

```ts
import { describeHttpError, httpClient, httpResponseError } from '../../shared/httpClient.js';

try {
  const response = await httpClient.post(url, payload, { timeout: 10_000 });
  // 2xx only
} catch (error) {
  const failure = httpResponseError(error);
  if (failure) {
    // The host answered with a bad status: `failure.status`, `failure.data`.
    // Do not retry - a retry will not change the answer.
  } else {
    // Unreachable or timed out: safe to retry.
    log.warn({ reason: describeHttpError(error) }, 'call failed');
  }
}
```

Two deliberate choices:

- **Non-2xx responses throw** (the axios default). A caller that wants a
  provider's error body asks for it via `httpResponseError()`. Silent failure
  is worse for payments and shipping than for a notification, so the safe
  default wins.
- **`httpResponseError()` doubles as the retry signal.** A response means
  "don't retry"; its absence means "unreachable, retry".

`describeHttpError()` produces log-safe text (never the response body or
headers, which may carry credentials).

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

Admin-only **writes** for a module do not add their own guard: the module exports
a second router (`productAdminRouter`, `categoryAdminRouter`, `uploadAdminRouter`)
that the admin router mounts inside its `requireAuth, requireAdmin` gate. That
keeps "everything under `/admin` is admin-only" true by construction rather than
by remembering a middleware — `products.routes.ts` is the reference.

> Imports use explicit `.js` extensions because the project is ESM
> (`"type": "module"` + `NodeNext` resolution).
