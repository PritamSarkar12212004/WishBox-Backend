# Wishbox Auth API

Passwordless login: a shopper enters their **name + WhatsApp number**, receives a
6-digit code on WhatsApp, and the backend issues a JWT pair.

Every example below is a real response captured from a local run of this backend,
with the `requestId`, `timestamp` and `stack` fields trimmed for readability.

- **Base URL**: `http://localhost:5000/api/v1` (`PORT` and `API_PREFIX` in `.env`)
- **Content type**: `application/json` for every request body
- **Auth**: `Authorization: Bearer <accessToken>` on protected routes

## Run it locally

```bash
npm run dev          # watch mode, uses .env
npm run build && npm start   # compiled
```

The example phone numbers in this document are valid-shaped Indian mobiles. With
`OTP_DEBUG_RETURN_CODE=true` (dev only) the code comes back in the response as
`devCode`, so no real WhatsApp message is needed to exercise the flow.

---

## 1. Response envelope

Every endpoint - success or failure - returns the same shape, so a client can
always branch on `success`:

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy",
  "data": { },
  "error": null,
  "timestamp": "2026-10-06T09:42:36.000Z",
  "requestId": "79eb72dc-22e3-4154-8dbd-83c695fc582c"
}
```

On failure `data` is `null` and `error` carries a stable machine-readable code:

```jsonc
{
  "success": false,
  "statusCode": 400,
  "message": "That code is not correct. 4 attempts left.",
  "data": null,
  "error": {
    "code": "OTP_INVALID",
    "message": "That code is not correct. 4 attempts left.",
    "details": { "attemptsRemaining": 4 }
  },
  "timestamp": "2026-10-06T09:42:38.652Z",
  "requestId": "4fbb167a-9805-44ca-a6e6-5f1dd6c07654"
}
```

`requestId` is worth logging on the client: it is the same id the server writes to
its logs for that request. `stack` appears **only outside production**.

> Responses are pretty-printed (2-space indent) outside production and compact in
> production - see `app.set('json spaces', ...)` in `src/app.ts`. That is easy to
> miss when scraping values with `sed`/`grep`, so any pattern you write should
> tolerate a space after the colon.

---

## 2. Endpoints at a glance

| Method  | Path                    | Auth   | Purpose                                    |
| ------- | ----------------------- | ------ | ------------------------------------------ |
| `GET`   | `/`                     | -      | API identity (name, version, prefix)       |
| `GET`   | `/health`               | -      | Liveness + database readiness              |
| `POST`  | `/auth/otp/request`     | -      | Step 1: send the code on WhatsApp          |
| `POST`  | `/auth/otp/verify`      | -      | Step 2: verify the code, find/create user  |
| `POST`  | `/auth/refresh`         | -      | Exchange a refresh token for a new pair    |
| `POST`  | `/auth/logout`          | Bearer | Sign out this device or every device       |
| `GET`   | `/auth/me`              | Bearer | Current profile (alias of `/users/me`)     |
| `GET`   | `/users/me`             | Bearer | Current profile                            |
| `PATCH` | `/users/me`             | Bearer | Update the display name                    |

For a copy-paste shell walkthrough, jump to [section 9](#9-full-flow-in-one-script).

---

## 3. `GET /` and `GET /health`

```bash
curl http://localhost:5000/api/v1/
```

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Wishbox API is running",
  "data": { "name": "Wishbox API", "version": "v1", "prefix": "/api/v1" },
  "error": null
}
```

```bash
curl http://localhost:5000/api/v1/health
```

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy",
  "data": {
    "status": "ok",
    "uptime": 11,
    "environment": "development",
    "version": "1.0.0",
    "services": { "database": { "status": "connected", "healthy": true } }
  },
  "error": null
}
```

When MongoDB is unreachable the same route answers `503`, `data` becomes `null`
and the health payload moves into `error.details`:

```jsonc
{
  "success": false,
  "statusCode": 503,
  "message": "Service unavailable: database is not connected",
  "data": null,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service unavailable: database is not connected",
    "details": {
      "status": "degraded",
      "uptime": 11,
      "environment": "development",
      "version": "1.0.0",
      "services": { "database": { "status": "disconnected", "healthy": false } }
    }
  }
}
```

---

## 4. `POST /auth/otp/request` - step 1

Sends (or re-sends) the login code on WhatsApp.

| Field   | Type   | Required | Rules                                                     |
| ------- | ------ | -------- | --------------------------------------------------------- |
| `phone` | string | yes      | 10-digit Indian mobile starting 6-9. `+91 98765 43210`, `919876543210` and `9876543210` all normalise to `9876543210`. |
| `name`  | string | no       | Accepted for symmetry with step 2, **not stored** yet.    |

```bash
curl -X POST http://localhost:5000/api/v1/auth/otp/request \
  -H 'content-type: application/json' \
  -d '{"phone":"9876500001","name":"Aarav Sharma"}'
```

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "We sent a code to your WhatsApp number",
  "data": {
    "phone": "9876500001",
    "channel": "whatsapp",
    "expiresInSeconds": 300,
    "resendAfterSeconds": 30,
    "isNewUser": true,
    "devCode": "259330"
  },
  "error": null
}
```

- `expiresInSeconds` = `OTP_TTL_SECONDS` (default 300).
- `resendAfterSeconds` = `OTP_RESEND_COOLDOWN_SECONDS` (default 30) - drives the
  storefront's resend countdown.
- `isNewUser: true` means this number has no account yet, so step 2 must include
  a `name`.
- `devCode` only exists when `OTP_DEBUG_RETURN_CODE=true` and `NODE_ENV` is not
  `production` (the process refuses to boot with that combination).

**Errors**

| Status | Code                | When                                                   |
| ------ | ------------------- | ------------------------------------------------------ |
| 422    | `VALIDATION_ERROR`  | Number missing or not a valid Indian mobile            |
| 429    | `OTP_COOLDOWN`      | Another request for this number inside 30s             |
| 429    | `TOO_MANY_REQUESTS` | Rate limit (see [section 8](#8-rate-limits))           |
| 502    | `WHATSAPP_DELIVERY_FAILED` | The gateway rejected the message or is unreachable |

Invalid number:

```jsonc
{
  "success": false,
  "statusCode": 422,
  "message": "Validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "phone", "message": "Enter a valid 10-digit WhatsApp number starting with 6, 7, 8 or 9" }
    ]
  }
}
```

Resend inside the cooldown:

```jsonc
{
  "success": false,
  "statusCode": 429,
  "message": "Please wait 30s before requesting another code",
  "data": null,
  "error": {
    "code": "OTP_COOLDOWN",
    "message": "Please wait 30s before requesting another code",
    "details": { "retryAfterSeconds": 30 }
  }
}
```

If the gateway fails, the challenge is deleted immediately, so the shopper is
**not** made to wait out the cooldown before retrying.

---

## 5. `POST /auth/otp/verify` - step 2

Verifies the code, creates the account when the number is new, and returns the
session.

Every successful verify also sends the WishBox welcome template
(`6ac4c92f957ea5b2deceea92`) to that number. The send is fire-and-forget: it
starts once the session has been issued, so a slow or failing gateway neither
delays nor fails this response. A returning shopper gets the welcome again on
each subsequent sign-in.

| Field  | Type   | Required | Rules                                        |
| ------ | ------ | -------- | -------------------------------------------- |
| `phone`| string | yes      | Same normalisation as step 1                  |
| `code` | string | yes      | Exactly 6 digits                              |
| `name` | string | see below| 2-80 characters. **Required only when creating a new account**; on an existing account a new value updates the stored name. |

```bash
curl -X POST http://localhost:5000/api/v1/auth/otp/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"9876500001","code":"259330","name":"Aarav Sharma"}'
```

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Welcome, Aarav Sharma",
  "data": {
    "user": {
      "id": "6ac4c1deab2bc4a251ab32ea",
      "name": "Aarav Sharma",
      "phone": "9876500001",
      "phoneVerifiedAt": "2026-10-06T09:42:36.589Z",
      "role": "customer",
      "createdAt": "2026-10-06T09:42:36.595Z",
      "lastLoginAt": "2026-10-06T09:42:36.589Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresInSeconds": 900
  },
  "error": null
}
```

- `accessToken` is short lived (`JWT_EXPIRES_IN`, default `15m` → 900s).
- `refreshToken` is long lived (`JWT_REFRESH_EXPIRES_IN`, default `30d`) and is
  **rotated on every use**.
- At most `AUTH_MAX_SESSIONS` (default 5) devices stay signed in; the oldest
  refresh session is dropped.
- `phone` is stored as 10 digits with no country code - the same shape the
  storefront keeps in its identity store.

**Errors**

| Status | Code                      | When                                             |
| ------ | ------------------------- | ------------------------------------------------ |
| 422    | `VALIDATION_ERROR`        | Bad phone, or code that is not 6 digits           |
| 400    | `OTP_INVALID`             | Wrong code, with `details.attemptsRemaining`      |
| 400    | `OTP_EXPIRED`             | No challenge, expired, or the code was already used |
| 429    | `OTP_TOO_MANY_ATTEMPTS`   | `OTP_MAX_ATTEMPTS` (default 5) wrong guesses      |
| 400    | `BAD_REQUEST`             | New account and no `name` supplied                |
| 403    | `FORBIDDEN`               | The account is blocked                            |

```jsonc
// 400 - wrong code
{
  "success": false,
  "statusCode": 400,
  "message": "That code is not correct. 4 attempts left.",
  "data": null,
  "error": {
    "code": "OTP_INVALID",
    "message": "That code is not correct. 4 attempts left.",
    "details": { "attemptsRemaining": 4 }
  }
}
```

```jsonc
// 400 - reusing a code that was already spent
{
  "success": false,
  "statusCode": 400,
  "message": "This code has expired, please request a new one",
  "data": null,
  "error": { "code": "OTP_EXPIRED", "message": "This code has expired, please request a new one" }
}
```

Codes are single use: the winning request deletes the challenge atomically, so a
copied code can never mint a second session.

---

## 6. `POST /auth/refresh`

Exchanges a refresh token for a fresh pair. No `Authorization` header needed -
the refresh token itself is the credential.

```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

Response: the same `data` shape as step 2 (`user`, `accessToken`,
`refreshToken`, `expiresInSeconds`), with `"message": "Session refreshed"`.

**Rotation**: the presented refresh token is retired as soon as it is used.
Replaying it fails:

```jsonc
{
  "success": false,
  "statusCode": 401,
  "message": "This session was signed out, please sign in again",
  "data": null,
  "error": { "code": "UNAUTHORIZED", "message": "This session was signed out, please sign in again" }
}
```

Sending an **access** token here fails with `401 UNAUTHORIZED`
`Invalid authentication token` (the token types are not interchangeable).

---

## 7. `GET /auth/me`, `GET /users/me`, `PATCH /users/me`, `POST /auth/logout`

### Profile

```bash
curl http://localhost:5000/api/v1/auth/me -H 'authorization: Bearer <accessToken>'
curl http://localhost:5000/api/v1/users/me -H 'authorization: Bearer <accessToken>'
```

Both return the same profile (`"message": "Your profile"`):

```jsonc
{
  "success": true,
  "statusCode": 200,
  "data": {
    "id": "6ac4c1deab2bc4a251ab32ea",
    "name": "Aarav S. Sharma",
    "phone": "9876500001",
    "phoneVerifiedAt": "2026-10-06T09:42:36.589Z",
    "role": "customer",
    "createdAt": "2026-10-06T09:42:36.595Z",
    "lastLoginAt": "2026-10-06T09:42:36.589Z"
  },
  "error": null
}
```

Missing token:

```jsonc
{ "success": false, "statusCode": 401, "message": "Authentication required",
  "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

Malformed or expired token - note the different message, so clients can tell
"never signed in" from "signed in too long ago":

```jsonc
{ "success": false, "statusCode": 401, "message": "Invalid authentication token",
  "error": { "code": "UNAUTHORIZED", "message": "Invalid authentication token" } }
```

### Update the name

```bash
curl -X PATCH http://localhost:5000/api/v1/users/me \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{"name":"Aarav S. Sharma"}'
```

```jsonc
{ "success": true, "statusCode": 200, "message": "Profile updated",
  "data": { "id": "6ac4c1deab2bc4a251ab32ea", "name": "Aarav S. Sharma", "phone": "9876500001", "...": "..." } }
```

Only `name` is editable. Changing the WhatsApp number has to be verified again,
so it goes through the OTP flow rather than a plain patch. An empty body is
rejected with `422 VALIDATION_ERROR` and `details: [{ "field": "(root)",
"message": "Provide at least one field to update" }]`.

### Logout

```bash
# this device only
curl -X POST http://localhost:5000/api/v1/auth/logout \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'

# every device
curl -X POST http://localhost:5000/api/v1/auth/logout \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{"allDevices":true}'
```

```jsonc
{ "success": true, "statusCode": 200, "message": "Signed out", "data": null, "error": null }
// allDevices:true  ->  "message": "Signed out everywhere"
```

`refreshToken` is optional; omitting it (or passing `allDevices: true`) signs out
every session. After a single-device logout:

- `POST /auth/refresh` with that refresh token → `401`
  `This session was signed out, please sign in again`
- `GET /auth/me` with the **access** token still answers `200` until it expires
  (default 15 minutes), because access tokens are stateless. Clients should
  treat a `401` from `/auth/refresh` as "session over".

---

## 8. Rate limits

| Scope                | Limit                                  | Applies to                |
| -------------------- | -------------------------------------- | ------------------------- |
| Global               | `RATE_LIMIT_MAX` (100) per `RATE_LIMIT_WINDOW_MS` (15 min) | every route |
| Sensitive auth       | 10 **failed** requests per 15 min      | `/auth/otp/request`, `/auth/otp/verify` |

Successful OTP calls are not counted against the auth limiter, so a normal login
never trips it. Exceeding either returns `429 TOO_MANY_REQUESTS` with
`"Too many requests, please try again later."` Both limiters are disabled under
`NODE_ENV=test`.

---

## 9. Full flow in one script

Copy-paste into Git Bash (or any bash). It signs a shopper in and calls a
protected route using only `curl`:

```bash
API=http://localhost:5000/api/v1
PHONE=9876500001

# 1. ask for a code (dev returns it in the response)
REQUEST=$(curl -s -X POST "$API/auth/otp/request" \
  -H 'content-type: application/json' -d "{\"phone\":\"$PHONE\"}")
echo "$REQUEST"
CODE=$(printf '%s' "$REQUEST" | sed -n 's/.*"devCode": *"\([0-9]*\)".*/\1/p')

# 2. verify it - this creates the account on first sign-in
SESSION=$(curl -s -X POST "$API/auth/otp/verify" \
  -H 'content-type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"code\":\"$CODE\",\"name\":\"Aarav Sharma\"}")
echo "$SESSION"
ACCESS=$(printf '%s' "$SESSION" | sed -n 's/.*"accessToken": *"\([^"]*\)".*/\1/p')
REFRESH=$(printf '%s' "$SESSION" | sed -n 's/.*"refreshToken": *"\([^"]*\)".*/\1/p')

# 3. call a protected route
curl -s "$API/users/me" -H "authorization: Bearer $ACCESS"
echo

# 4. rotate the refresh token
curl -s -X POST "$API/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}"
echo

# 5. sign out everywhere
curl -s -X POST "$API/auth/logout" -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' -d '{"allDevices":true}'
```

Everything is verified by `npm test`, which runs this same flow over real HTTP
against an in-memory MongoDB - see `tests/auth.test.ts`.
