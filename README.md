# FitFlow API

REST backend for the FitFlow app, built with NestJS and MongoDB (Mongoose).
It replaces Firebase: Google Sign-In on the device, ID token verified here,
then the API issues its own JWT and stores per-user sync data.

## Requirements

- Node.js 24 and npm
- MongoDB 7+ running locally (default URI assumes user `admin` / `123456`
  authenticating against the `admin` database). These are local development
  credentials only — use your own user and password for any shared or
  deployed database.

## Setup and run

```sh
cd backend
npm install
cp .env.example .env   # adjust MONGODB_URI / PORT if needed
npm run build && npm run seed   # load the built-in workout templates
npm run admin:create -- you@example.com "Your Name"   # admin-web account
npm run start:dev               # http://localhost:3001/api
```

`npm run admin:create -- <email> [name]` asks for the password twice
(hidden; at least 8 characters) or reads it from `ADMIN_PASSWORD` when not
run in a terminal. Run it again for an existing email to set a new
password. Like `seed`, it runs from `dist/` and needs only `MONGODB_URI`.
The admin web is a browser app on another origin, so add its origin to
`CORS_ORIGINS` (e.g. `http://localhost:5173` in development).

`npm run seed` loads the built-in templates of
`src/templates/seed/workout-templates.seed.ts` (exported from the app's
`lib/data/seed_workouts.dart`) into an empty `workouttemplates`
collection; once templates exist it does nothing, since the admin web
manages them from then on. `npm run seed -- --reset` makes the
collection match the built-ins exactly (overwrites edits, deletes
templates added in the admin web). Both are safe to run repeatedly, run the compiled `dist/seed.js` and need only `MONGODB_URI`,
so they never rebuild `dist/` under a running server. Seed data is fully
validated before the first write.

Every route lives under `/api`. Interactive docs (Swagger UI, off in
production unless `SWAGGER_ENABLED=true`) are served at
<http://localhost:3001/api/docs> — sign in via `POST /api/auth/google`, then
paste the access token into **Authorize**. The app refuses to start when a required
environment variable is missing or invalid (see `src/config/env.validation.ts`).

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `PORT` | `3001` | HTTP port |
| `MONGODB_URI` | — (required) | MongoDB connection string |
| `GOOGLE_CLIENT_IDS` | — (required) | Comma-separated Google OAuth client IDs accepted as ID-token audience (the app's `serverClientId`) |
| `JWT_ACCESS_SECRET` | — (required, ≥ 32 chars) | HMAC secret for access tokens |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime |
| `ADMIN_TOKEN_TTL_SECONDS` | `28800` | Admin-web access token lifetime (≥ 300) |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime |
| `AUTH_RATE_LIMIT` | `20` | Requests per minute per client IP, shared across `/api/auth/*` and `DELETE /api/me` (`429` beyond) |
| `ADMIN_LOGIN_RATE_LIMIT` | `10` | `POST /api/admin/auth/login` attempts per minute per client IP; a separate budget, so admin logins never block app sign-ins |
| `TRUST_PROXY_HOPS` | `0` | Reverse proxies in front of the API; set it when deployed behind one so rate limits see the real client IP |
| `SWAGGER_ENABLED` | on, except `NODE_ENV=production` | Serve Swagger UI at `/api/docs` |
| `CORS_ORIGINS` | empty (CORS off) | Comma-separated exact browser origins (`https://host[:port]`, no path or `*`) allowed to call the API; the mobile app needs none |
| `OPENAI_API_KEY` | empty (AI disabled) | Server-side OpenAI API key used by `/api/ai/*` (workout plans, meal plans, food photo vision, form review) |
| `OPENAI_MODEL` | `gpt-6-luna` | OpenAI model used for structured JSON completions |
| `MONGODB_TEST_URI` | local `fitflow-test` DB | Database used by the test suites (never the dev DB); export it in the shell — `.env` is not read for it |

## Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api` | API name and version |
| GET | `/api/health` | `200 {status, database}` when MongoDB answers a ping, `503` otherwise |
| POST | `/api/auth/google` | Body `{idToken}` (Google Sign-In ID token) → `200 {accessToken, expiresIn, refreshToken, user}`; creates the account on first sign-in; `401` if Google does not verify the token or the email |
| POST | `/api/auth/refresh` | Body `{refreshToken}` → new `{accessToken, expiresIn, refreshToken}`; the old refresh token stops working |
| POST | `/api/auth/logout` | Body `{refreshToken}` → `204`; revokes that session's refresh tokens |
| GET | `/api/templates` | Built-in workout plans in display order (`Cache-Control: public, max-age=300`), in the app's `Workout` JSON shape (`id`, `name`, `durationMinutes`, `level`, `category`, `description`, `exercises`) |
| GET | `/api/ai/status` | `{configured, model}` — whether the server has `OPENAI_API_KEY` configured |
| POST | `/api/ai/generate` | Structured-output JSON completion proxy (`{system, user, schema, schemaName, reasoningEffort?, imageBase64?, imageMimeType?}`) |
| POST | `/api/ai/workout-plan` | Generate a structured workout plan from `{request, level?, durationMinutes?, goal?}` |
| POST | `/api/ai/meal-plan` | Generate a daily meal plan from `{targetKcal, proteinG, meals, goal?, preferences?}` |
| POST | `/api/ai/food-photo` | Identify dishes and estimate calories/macros from `{imageBase64, imageMimeType?}` |
| POST | `/api/ai/form-review` | Review post-set rep telemetry from `{exercise, reps}` |
| GET | `/api/me/docs/:kind` | 🔒 All synced documents of `kind` (`sessions`, `workouts`, `weights`, `meals`); `?since=yyyy-mm-dd` keeps ids from that day on; deleted ones as `{id, deleted: true}` |
| PUT | `/api/me/docs/:kind` | 🔒 Bulk upsert, body `{docs: [{id, …}]}` (≤ 500, ≤ 2 MB; other routes accept ≤ 100 kB) → `204` |
| PUT | `/api/me/docs/:kind/:id` | 🔒 Create or replace one document (the app's JSON) → `204` |
| DELETE | `/api/me/docs/:kind/:id` | 🔒 Soft delete (tombstone) → `204` |
| GET | `/api/me` | 🔒 Profile `{id, email, name, photoUrl}` of the caller |
| DELETE | `/api/me` | 🔒 Body `{idToken}` from a Google sign-in of the same account made within the last 5 minutes (`403` otherwise — never `401`, so the app does not mistake it for an expired session) → `204`; deletes the account, every session and its documents |
| GET | `/api/me/meta` | 🔒 `{updatedAt, meta}` — the app's profile/schedule/onboarding/weekly-goal blob; `meta` is `null` until first written |
| PUT | `/api/me/meta` | 🔒 Body `{updatedAt, meta}` → `{applied, updatedAt, meta}`; applied only if `updatedAt` (epoch ms) is newer than the stored one, otherwise the newer server copy is returned; `updatedAt` more than 5 minutes ahead of the server clock is `400` |
| POST | `/api/admin/auth/login` | Body `{email, password}` → `200 {accessToken, expiresIn, admin: {id, email, name}}`; `401 Invalid email or password` for an unknown email or a wrong password alike |
| GET | `/api/admin/me` | 🛡 The signed-in admin `{id, email, name}` |
| GET | `/api/admin/templates` | 🛡 Every workout template in display order, app shape plus `updatedAt` |
| GET | `/api/admin/templates/:id` | 🛡 One template; `404` if unknown |
| POST | `/api/admin/templates` | 🛡 Create `{id, name, durationMinutes, level, category, description, exercises}` → `201`, appended to the list; `409` if the id is taken |
| PUT | `/api/admin/templates/:id` | 🛡 Replace all fields but `id` and position → `200`; `404` if unknown |
| DELETE | `/api/admin/templates/:id` | 🛡 → `204`; `404` if unknown |
| GET | `/api/admin/users` | 🛡 `?search=&status=all\|active\|locked&page=1&limit=20` (limit ≤ 100) → `{items, total, page, limit}`, newest first; each item `{id, email, name, photoUrl, disabled, createdAt, lastSignInAt, sessionCount}` (finished workouts, form checks excluded); search matches email or name, case-insensitive |
| GET | `/api/admin/users/:id` | 🛡 The item above plus the synced `profile` (goal, level, weekly goal, height, age, sex, activity level; `null` until the app syncs one), live document `counts`, workout `totals` (minutes, volume), `latestWeightKg`, `lastSyncAt` and the 10 most recent sessions; `404` if unknown |
| PATCH | `/api/admin/users/:id` | 🛡 Body `{disabled}`: `true` locks the account, `false` unlocks it; either way all its sessions end (after an unlock the user signs in again) → the list item |
| DELETE | `/api/admin/users/:id` | 🛡 Deletes the account, its sessions and every synced document → `204`; `404` if unknown |
| GET | `/api/admin/stats/overview` | 🛡 `?days=1..90` (default 30) `&tz=<IANA zone>` (default `UTC`) → `{range, users: {total, locked, new, active}, sessions: {total, inRange, minutesInRange, formChecksInRange}, ai: {calls, errors}, templates, daily: [{date, newUsers, sessions, formChecks, aiCalls, aiErrors}]}` |
| GET | `/api/admin/stats/ai` | 🛡 Same query → `{range, status, totals: {calls, errors, users, anonymousCalls, avgDurationMs}, byFeature, daily, errorsByCode, topUsers, recent}` (`recent` = latest 50 calls whatever the range) |
| POST | `/api/admin/templates/reorder` | 🛡 Body `{ids}` listing every template id exactly once (else `400`) → the list in the new order |

🔒 = needs `Authorization: Bearer <accessToken>`.
🛡 = needs an admin access token from `POST /api/admin/auth/login`.

Every `/api/ai/*` call except `status` is logged in `aiusages` for the
admin web: caller (when the request carries a valid app access token;
otherwise anonymous — the token is optional for now), feature, model,
success or the error code the app saw, and duration. Prompts, photos and
answers are never stored; entries expire after 180 days.

### Locked accounts

An admin can lock an account (`PATCH /api/admin/users/:id`). Locking
deletes its refresh tokens; from then on Google sign-in answers `403
Account is locked`, refreshing fails with `401`, and every `/api/me`
route answers `401 Account is locked` even for an access token issued
before, so the app drops its session at once and lands on the sign-in
page. Unlocking lets the user sign in again (it also ends any session
that raced the lock); their data is untouched. A locked user cannot
delete their own account (they cannot sign in); an admin can.

### Admin statistics

Days are counted in the `tz` the admin web sends. Signups and AI calls are
bucketed by their server timestamp in that zone; workouts by the date of
their `completedAt` as the phone wrote it (its local time), so an evening
workout in Vietnam lands on the right day. Minutes follow the app: whole
minutes per session, at least 1. Form-check results are counted apart
from workouts, and "active" users finished a workout or form check in the
range.

### Template rules

What the admin API accepts is what the app can parse and filter: `level`
is `Beginner`, `Intermediate` or `Advanced`; `category` is `Strength`,
`Cardio` or `Mobility`; ids are lowercase words joined by `-` and may not
start with `custom-` (the app's own plans) or be `form-check`. A template
has 1–30 exercises with unique ids, each rep-based (`reps` > 0) or timed
(`durationSeconds` > 0), not both. `GET /api/templates` may be cached for
5 minutes, so edits reach devices on their next template refresh after
that.

### Sync documents

Documents are the app's own JSON (`WorkoutSession`, `Workout`,
`BodyWeightEntry`), stored as-is. Ids must match `[A-Za-z0-9_.:-]{1,128}`
and field names may not start with `$` or contain `.`. A `PUT` after a
`DELETE` revives the document — the same last-write-wins semantics the app
had with Firestore (it needs this: a body-weight entry deleted and logged
again on the same day reuses its `yyyy-mm-dd` id). Writes for a deleted
account are refused with `401`.

### Sessions

Access tokens are HS256 JWTs (`sub` = user id, `iss` = `fitflow-api`,
`aud` = `fitflow-app`) valid for `ACCESS_TOKEN_TTL_SECONDS`. They are not
tracked server-side, so after logout an access token keeps working until
it expires (15 minutes by default); the app discards it on logout.

Refresh tokens are 32 random bytes (base64url), stored only as SHA-256
hashes in `refreshtokens` with a TTL index, and single-use:

- Each refresh atomically marks the token used and returns a new pair in
  the same session; refreshing fails once the account is deleted or locked.
- A used token replayed within 10 s (a client retry) just gets `401`.
  Replayed later, it is treated as stolen and the whole session is revoked.
- If issuing the new pair fails, the old token is restored.

### Admin sessions

Admins of the admin web are separate from app users: email + password
accounts in `admins`, created with `npm run admin:create`. Passwords are
stored as scrypt hashes (`scrypt$N$r$p$salt$hash`, random 16-byte salt).
Login returns only an access token (`aud` = `fitflow-admin`, valid for
`ADMIN_TOKEN_TTL_SECONDS`); there is no refresh token, so the admin signs
in again when it expires. Admin and app tokens share the signing secret
but not the audience, so neither is accepted in place of the other. Every
admin request re-checks that the admin still exists: deleting the
document locks the admin out immediately.

## Data model

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `googleSub` (unique), `email`, `name`, `photoUrl`, `meta`, `metaUpdatedAt`, `disabled`, `lastSignInAt` | Created on first Google sign-in; `meta` is the app's last-write-wins profile blob; `disabled` = locked by an admin |
| `workouttemplates` | `_id` (app id, e.g. `full-body-foundation`), `name`, `durationMinutes`, `level`, `category`, `description`, `exercises`, `order` | Public built-in plans |
| `userdocs` | `userId`, `kind`, `docId`, `data`, `deleted` — unique `(userId, kind, docId)` | Synced sessions / custom workouts / weights / logged meals (id `yyyy-mm-dd:<entry>`); deletes are tombstones so another device's merge cannot resurrect them |
| `admins` | `email` (unique, lowercase), `name`, `passwordHash`, `lastLoginAt` | Admin-web accounts |
| `aiusages` | `userId` (or null), `feature`, `model`, `ok`, `errorCode`, `durationMs`, `createdAt` (TTL 180 days) | One entry per AI call, no content |
| `refreshtokens` | `userId`, `sessionId`, `tokenHash` (unique), `usedAt`, `expiresAt` (TTL) | Current and used tokens of each session |

Every error uses the same body:
`{ statusCode, error, message, path, timestamp }`.

## Quality checks and tests

```sh
npm run lint
npm run typecheck   # src and tests
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm test           # unit tests (Vitest)
npm run test:e2e   # HTTP + MongoDB integration tests (needs MongoDB running;
                   # suites run one at a time on the fitflow-test database)
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every
push to `main` and every pull request, against a MongoDB service container.

## Roadmap

The migration off Firebase is split into small PRs — see
[`docs/backend-migration.md`](https://github.com/PRM-393-G5/fitflow/blob/main/docs/backend-migration.md) in the app repository.
