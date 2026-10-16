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
npm run start:dev               # http://localhost:3001/api
```

`npm run seed` makes the `workouttemplates` collection match
`src/templates/seed/workout-templates.seed.ts` (exported from the app's
`lib/data/seed_workouts.dart`); it is safe to run repeatedly. It runs the
compiled `dist/seed.js` and needs only `MONGODB_URI`, so it never rebuilds
`dist/` under a running server. Seed data is fully validated before the
first write.

Every route lives under `/api`. Interactive docs (Swagger UI) are served at
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
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime |
| `AUTH_RATE_LIMIT` | `20` | Requests per minute per client IP on `/api/auth/*` and `DELETE /api/me` (`429` beyond) |
| `CORS_ORIGINS` | empty (CORS off) | Comma-separated browser origins allowed to call the API; the mobile app needs none |
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
| GET | `/api/me/docs/:kind` | 🔒 All synced documents of `kind` (`sessions`, `workouts`, `weights`); deleted ones as `{id, deleted: true}` |
| PUT | `/api/me/docs/:kind` | 🔒 Bulk upsert, body `{docs: [{id, …}]}` (≤ 500, ≤ 2 MB; other routes accept ≤ 100 kB) → `204` |
| PUT | `/api/me/docs/:kind/:id` | 🔒 Create or replace one document (the app's JSON) → `204` |
| DELETE | `/api/me/docs/:kind/:id` | 🔒 Soft delete (tombstone) → `204` |
| GET | `/api/me` | 🔒 Profile `{id, email, name, photoUrl}` of the caller |
| DELETE | `/api/me` | 🔒 Body `{idToken}` from a Google sign-in of the same account made within the last 5 minutes (`403` otherwise — never `401`, so the app does not mistake it for an expired session) → `204`; deletes the account, every session and its documents |
| GET | `/api/me/meta` | 🔒 `{updatedAt, meta}` — the app's profile/schedule/onboarding/weekly-goal blob; `meta` is `null` until first written |
| PUT | `/api/me/meta` | 🔒 Body `{updatedAt, meta}` → `{applied, updatedAt, meta}`; applied only if `updatedAt` (epoch ms) is newer than the stored one, otherwise the newer server copy is returned; `updatedAt` more than 5 minutes ahead of the server clock is `400` |

🔒 = needs `Authorization: Bearer <accessToken>`.

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
  the same session; refreshing fails once the account is deleted.
- A used token replayed within 10 s (a client retry) just gets `401`.
  Replayed later, it is treated as stolen and the whole session is revoked.
- If issuing the new pair fails, the old token is restored.

## Data model

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `googleSub` (unique), `email`, `name`, `photoUrl`, `meta`, `metaUpdatedAt` | Created on first Google sign-in; `meta` is the app's last-write-wins profile blob |
| `workouttemplates` | `_id` (app id, e.g. `full-body-foundation`), `name`, `durationMinutes`, `level`, `category`, `description`, `exercises`, `order` | Public built-in plans |
| `userdocs` | `userId`, `kind`, `docId`, `data`, `deleted` — unique `(userId, kind, docId)` | Synced sessions / custom workouts / weights; deletes are tombstones so another device's merge cannot resurrect them |
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
