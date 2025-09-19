# SECURITY.md — booking-system

**Project**: Restaurant Booking System  
**Stack**: Next.js 15 (App Router), React 19, Node 22.19.0, PostgreSQL, `pg`, `pino`  
**Status**: Development (Staging DB). Auth0 & Render planned.  
**Last updated**: 2025‑09‑19

> This document covers expected production behavior.
---

## Production plan & assumptions

### Assumptions

- Hosting: Render (Web Service + Managed Postgres).
- Auth: Auth0 (1 user only).
- Access model: the Auth0 user = full access to operations within the app.
- Stability: use the production-stable dependency set (Next 15.3.5, React 19.0.0, Node 22.19.0).

### Runtime & versions

- Node: 22.19.0 (pin in engines + Render runtime).
- Next: 15.3.5 (pinned).
- React/DOM: 19.0.0 (pinned).
- **CRITICAL**: Commit package-lock.json to ensure exact dependency versions across environments.
- Run `npm ci` (not `npm install`) in production to use lockfile exactly.
- Set up automated security audits with `npm audit` in CI/CD pipeline.

### Authentication

- Add middleware.ts using Auth0 withMiddlewareAuthRequired to protect all app routes except static assets.
- No roles required in Auth0 (all users have access to all routes in the app).
- Session cookies: secure, HttpOnly, SameSite=Lax (default from SDK).

### CSRL & CORS

- API is same-origin only. No CORS.
- If you use cookie sessions for API calls, add a CSRF header check for POST/PUT/DELETE.

### Security headers

In next.config.ts → headers():
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

Add a minimal CSP (allow self + Auth0 on connect-src).

Example CSP snippet for `next.config.ts`:

```ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://YOUR_AUTH0_DOMAIN",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  // other headers ...
];

export async function headers() {
  return [{ source: '/:path*', headers: securityHeaders }];
}
```

Make sure to verify actual CSP app needs.

### Database

Use Render Postgres with SSL required.
App connects as least-privileged user (no superuser). In production, connect to Database as app_user.
In production, use Internal Database URL from Render to connect to the database.

### Input validation

- Use Zod on all request bodies/queries in route handlers.
- Map known errors to friendly codes (e.g., TABLE_UNAVAILABLE → HTTP 409).
- Centralize validation schemas and error helpers (e.g., `src/lib/validation`) so request/response types stay consistent across handlers.

### Logging

- Stick with Pino emitting structured JSON to stdout (Render captures it automatically).
- Keep `pino-pretty` as a local-only dev convenience; no extra transports or file writes in prod.
- Redact obvious PII (`guest_phone`, notes, reservation snapshots) to avoid leaking sensitive data even in short-lived logs.
- Default production level stays at `info`; bump temporarily when debugging.

### Rate limiting (lightweight)

Add an in-memory limiter in middleware:
- Reads: 100 req/min/IP
- Writes: 50 req/min/IP
- Admin endpoints: 5 req/min/IP


---

## 1) Scope
In scope: all backend surfaces that handle data/auth logic—Next.js route handlers under `src/app/api/**`, shared services and database access in `src/lib/**`, middleware, global logging/error plumbing, and deployment/config assets (Next config, env management, scripts).

Out of scope: purely presentational client components and styling under `src/app/**` (pages/layouts) and `src/components/**` as long as they don’t introduce new network calls or data processing.

---

## 2) Architecture
- **Next.js App Router** with route handlers in `app/api/**`.
- **DB access** via `src/lib/database.ts` (pg Pool), helpers in `src/lib/services.ts`.
- **Schema** in `src/lib/schema.sql` (rooms, tables, reservations, employees, reservation_activity_logs + triggers/funcs).
- **Logging** via `pino` with helper wrappers `logger.ts`.
- **Staff UI & API share the router**: `src/app/{reservations,overview,activity,configuration}/page.tsx` render the operator interface that calls into those APIs.
- **Business logic centralized** in `src/lib/services.ts`, wrapping transactions, conflict handling, and activity logging.
- **Tooling layer**: `src/scripts/*` provide schema/seeding/maintenance commands and `src/lib/api-client.ts` is the client-side fetch wrapper used throughout the UI.

---

## 3) Threat model & roles
**Actors**
- Staff (authenticated via Auth0, full app access while backend connects with least-privileged DB role `app_user`)
- Admin/maintenance operator (not an Auth0 user; runs Render cron jobs or local scripts that connect with a privileged DB credential or service account for cleanup/migrations)
- Attacker (unauthenticated internet user attempting to bypass Auth0 or abuse exposed endpoints)

**Assets**
- Reservations data (PII: guest name/phone, notes)
- Employees and layout data
- Activity logs (contain snapshots with PII)

**Key risks**
- Unauthorized read/write on `/api/**`
- CSRF on state‑changing endpoints if cookie auth is used
- PII in logs
- DoS via unbounded reads
- Weak DB role or no SSL to DB in prod
- Missing input validation leaves some SQL queries injectable (e.g., `status_filter` in `getReservationsWithCrossDay`).
- Admin-only maintenance endpoints (`/api/activity-logs/cleanup`, `/api/reservations/auto-complete`, etc.) are public until Auth0 middleware and rate limiting ship.

---

## 4) Authentication (Auth0)
Use `@auth0/nextjs-auth0` (edge). Protect all `/api/**` and app pages by default; selectively allow public routes (currently none).

### 4.1 Middleware guard
Create `src/middleware.ts`.

### 4.2 Auth helpers (no RBAC)
Create `src/lib/auth.ts` with thin wrappers around Auth0 SDK helpers (`getSession`, `getAccessToken`). Use inside route handlers to:
- Verify a session exists before mutating data (throw 401 otherwise).
- Surface user identifiers (sub/email) for audit logging and reservation activity attribution.

Auth0 roles are not used—any signed-in user has the same in-app permissions. Destructive/admin operations run outside the app (Render cron jobs or local scripts) using separate privileged credentials, so the app only needs to differentiate "authenticated" vs "public" requests.

### 4.3 Session security
- Use cookie session (Auth0 SDK default). Set `cookie.secure: true`, `SameSite=Lax` (or `Strict` if feasible).
- Rotate `AUTH0_SECRET` on schedule.

---

## 5) Authorization & route access policy
> Default: **deny** unless authenticated via Auth0. All signed-in users share the same UI permissions; destructive maintenance tasks still run via local scripts with privileged DB credentials.

| Route | Methods | Access | Notes |
|---|---|---|---|
| `/api/employees` | GET | Authenticated UI (configuration) | Supports `include_inactive`. Ensure only trusted staff reach configuration UI.
|  | POST | Authenticated UI (configuration) | Creates employees; add audit logging.
| `/api/employees/[id]` | GET | Authenticated UI (configuration) | 404 when missing.
|  | PUT | Authenticated UI (configuration) | Update employee profile/active flag.
|  | DELETE | Authenticated UI (configuration) | Currently allows hard delete; plan to restrict to deactivate-only or move to maintenance script if needed.
| `/api/rooms` | GET | Authenticated UI | Read list of rooms.
| `/api/rooms/[roomId]/tables` | GET | Authenticated UI | Read tables per room for floor plan.
| `/api/tables` | GET | Authenticated UI | Load all active tables.
| `/api/tables/[tableId]` | PUT | Authenticated UI | Update table properties/position; validate payload.
| `/api/reservations` | GET | Authenticated UI | **Add pagination**: enforce `limit<=200`, default `offset=0`.
|  | POST | Authenticated UI | Creates reservation; return `TABLE_UNAVAILABLE` on conflicts.
| `/api/reservations/[id]` | GET | Authenticated UI | Fetch reservation details with table/room.
|  | PUT | Authenticated UI | Update reservation fields/status; triggers activity logging.
|  | DELETE | Authenticated UI | Marks reservation cancelled + activity log entry.
| `/api/reservations/auto-complete` | POST | Internal job (cron/script) | Dangerous bulk updater. Remove from UI and protect via maintenance credential.
| `/api/availability` | GET | Authenticated UI | Table availability check; validate `tableId/date/time`.
| `/api/activity-logs` | GET | Authenticated UI (activity page) | Returns listings/summary/search; redact PII as needed.
| `/api/activity-logs/[reservationId]` | GET | Authenticated UI (activity page) | Single reservation history view.
| `/api/activity-logs/cleanup` | POST | Internal job (cron/script) | Cleanup endpoint; keep out of UI and enforce server-side bounds `1..12`.

**Auto-completion note**: keep the `/api/reservations/auto-complete` endpoint in the app for UI-triggered housekeeping, but add debounce/locking (e.g., allow once per N minutes via shared state or cache) so multiple open tabs don’t trigger it in parallel.

---

## 6) Request validation & error handling
Adopt **Zod** for input validation on every route receiving body/query. Create shared schemas under `src/lib/validation/` and reuse them in handlers/services.
```ts
import { z } from 'zod';

export const CreateReservationSchema = z.object({
  table_id: z.string().uuid(),
  guest_name: z.string().min(1).max(255),
  guest_phone: z.string().min(5).max(20).optional(),
  party_size: z.number().int().min(1).max(20),
  reservation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservation_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_hours: z.number().min(-1).max(12).default(2),
  notes: z.string().max(1000).optional(),
  created_by: z.string().max(100).optional(),
});

// in route handler
const payload = await request.json();
const parsed = CreateReservationSchema.safeParse(payload);
if (!parsed.success) {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid reservation payload',
        details: parsed.error.flatten(),
      },
    },
    { status: 400 }
  );
}

const body = parsed.data;
```

**Error responses & information disclosure prevention**: never pass raw DB errors to clients. Standardize:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…" } }
```
Provide a central helper (e.g., `src/lib/http-error.ts`) to map known service errors (e.g., `TABLE_UNAVAILABLE`) to HTTP 409 and sanitize logged context.

**Additional error handling safeguards** — **TODO(Prod)**:
- **Disable stack traces** in production: ensure `NODE_ENV=production` and strip stack traces from JSON responses (log server-side only).
- **Generic error messages**: Never expose internal system paths, database schema details, or implementation specifics.
- **Error monitoring**: Set up error tracking (e.g., Sentry) with sanitized error details for debugging.
- **HTTP 500 fallback**: Implement global error handler returning a generic "Internal Server Error" while logging structured context.
- **Request timeout**: Set reasonable timeouts on outbound calls (DB/fetch) to prevent resource exhaustion attacks.

---

## 7) CSRF
We are keeping Auth0's cookie session flow. Add a double-submit CSRF token so every `POST/PUT/DELETE` includes a verifiable header.

- On session creation (e.g., via `/api/auth/login` callback) mint a random token, store a signed hash server-side (cookie `csrf_token_sig` – HttpOnly) and expose the raw token in a separate, same-site cookie (`csrf_token`).
- Provide a helper (`src/lib/csrf.ts`) that reads the cookies, verifies the signature, and compares the header `x-csrf-token` with the cookie value in middleware/route handlers.
- In the client, read `csrf_token` once on load (via `document.cookie` or a tiny `/api/csrf` endpoint) and attach it to every mutating request header.
- Reject missing/invalid tokens with HTTP 403 before service logic runs; log attempts for auditing.

**TODO(Prod)**: implement CSRF middleware wrapping `POST/PUT/DELETE` routes and update the API client to automatically send `x-csrf-token`.

---

## 8) CORS
- API is same‑origin only. **Do not** enable `Access-Control-Allow-Origin: *`.
- If needed, allow explicit origins only (env‑driven allowlist).

---

## 9) HTTP security headers — **TODO(Prod)**
Add global headers in `next.config.ts`:
```ts
export default {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    }];
  },
} satisfies import('next').NextConfig;
```

### Content Security Policy (CSP)
Add CSP with Auth0 origins (adjust tenant):
```ts
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // consider nonces/hashes later
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://YOUR_AUTH0_DOMAIN",
  "frame-ancestors 'none'",
].join('; ');
```
Apply via `headers()` or per‑page headers.

---

## 10) Rate limiting — **TODO(Prod)**
Add per‑IP limits, stricter on admin/destructive endpoints:
- Read endpoints: 100 req/min/IP
- Write endpoints: 50 req/min/IP
- `/api/activity-logs/cleanup`, `/api/reservations/auto-complete`: 5 req/min/IP + require admin

Implement with an in‑memory token bucket in production.

---

## 11) Logging & privacy
Current logging includes PII (guest_name/phone) in service logs.

**Policies**
- Treat **guest phone, notes, reservation_snapshot** as **sensitive**.
- **Redact** sensitive fields in `pino`:
```ts
export const logger = pino({
  // ...existing config,
  redact: {
    paths: [
      'guest_phone',
      'reservation_snapshot.guest_phone',
      'field_changes.*.old',
      'field_changes.*.new',
      'request_body',
    ],
    censor: '[REDACTED]'
  }
}, createDestination());
```
- Avoid logging full SQL or unbounded objects.
- **Render note**: file destinations are ephemeral. Prefer stdout only in prod. Add env flag to disable file logging.

**Retention**
- Activity logs cleanup via endpoint, done by the admin manually.

---

## 12) Database security
**Connections**
- On Render: require SSL. Use `PGSSLMODE=require` or `ssl: { rejectUnauthorized: false }` in `pg` config.
- Prefer a single `DATABASE_URL` env. Example `postgres://user:pass@host:5432/db?sslmode=require`.

**Roles & least privilege**
Create a dedicated app role with minimum privileges.
Connect using `app_user`; reserve superuser for migrations, maintenance and operiations like clearing logs only.

**Schema hardening**
- Ensure **NOT NULL** where applicable (e.g., `tables.position_x/position_y` if required by UI).
- Keep overlap trigger as the **single source of truth** for conflicts.

**Backups**
- Automatic daily backups on Render.

---

## 13) Activity logs
- Contain full reservation snapshots (PII).
- Consider hashing/anonymizing sensitive data in snapshots, like phone numbers and names.

---

## 14) Pagination & query safety
Add `limit` (max 200) & `offset` to:
- `/api/reservations`

---

## 15) Secrets & environment
**Never** commit real secrets. Maintain `.env.example` only. Suggested keys:
```
NODE_ENV=
NEXT_PUBLIC_APP_URL=

# Database
APP_USER_STAGING_DATABASE_URL=
ADMIN_STAGING_DATABASE_URL=
APP_USER_PRODUCTION_DATABASE_URL=
ADMIN_PRODUCTION_DATABASE_URL=

# Auth0
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_ISSUER_BASE_URL=
AUTH0_BASE_URL=
AUTH0_SECRET=

# Logging
PINO_LOG_LEVEL=info
DISABLE_FILE_LOGS=true
```

Rotate secrets; store in Render dashboard; use separate vars per env.

---

## 16) Operational safeguards
- **Migrations**: run with a privileged user; app uses `app_user`.
- **Health checks**: expose minimal `/api/health` returning DB pool stats from `healthCheck()` without secrets.
- **Incidents**: on breach, rotate Auth0 secrets, DB password, revoke sessions, restore from backup, review logs.

---

## 17) Secure coding standards
- Validate inputs with Zod; no `any` types for bodies.
- Parameterized SQL only (already in use).
- Normalize dates server‑side (`normalizeDateForDb`).
- Don’t leak `error.message` from DB; map to standardized codes.
- Prefer `uuid` for external identifiers; never expose internal incremental IDs.

---