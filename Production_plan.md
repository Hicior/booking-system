# Restaurant Booking System - Production Plan

**Project**: Restaurant Booking System
**Stack**: Next.js 15 (App Router), React 19, Node 22.19.0, PostgreSQL, `pg`, `pino`
**Status**: Development (Staging DB). Auth0 & Render planned.
**Last updated**: 2025‑09‑19 (Enhanced for single-user simplicity)

---

## Executive Summary

### Project Overview
Restaurant booking system for "Pub Mentzen" with visual floor plan interface, cross-day reservation logic, and comprehensive activity logging. Single authenticated user model with full operational access.

### Key Technology Decisions
- **Hosting**: Render (Web Service + Managed Postgres)
- **Authentication**: Auth0 (single user, cookie-based sessions)
- **Runtime**: Node 22.19.0 (pinned), Next.js 15.3.5, React 19.0.0
- **Database**: PostgreSQL with SSL, least-privileged `app_user` role
- **Logging**: Pino minimal setup, structured JSON to stdout only

### Access Model
- Auth0 user = full access to all app operations
- Destructive/admin operations via separate scripts with privileged DB credentials
- No role-based access control within the app

---

## 1. Deployment & Infrastructure

### Runtime & Dependency Management
- **Node**: 22.19.0 (pin in engines + Render runtime)
- **Next**: 15.3.5 (pinned for stability)
- **React/DOM**: 19.0.0 (pinned)
- **CRITICAL**: Commit package-lock.json to ensure exact dependency versions
- Use `npm ci` (not `npm install`) in production
- Set up automated security audits with `npm audit` in CI/CD pipeline

### Database Configuration
- **Provider**: Render Postgres with SSL required (`PGSSLMODE=require`)
- **Connection**: Use Internal Database URL from Render
- **SSL Config**: `ssl: { rejectUnauthorized: false }` in `pg` config
- **App Role**: Connect as least-privileged `app_user` (no superuser access)
- **Admin Role**: Reserve superuser for migrations and maintenance scripts only
- **Backups**: Automatic daily backups on Render

### Environment Variables
```bash
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app.render.com

# Database
APP_USER_PRODUCTION_DATABASE_URL=postgres://app_user:pass@host:5432/db?sslmode=require
ADMIN_PRODUCTION_DATABASE_URL=postgres://admin:pass@host:5432/db?sslmode=require

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_BASE_URL=https://your-app.render.com
AUTH0_SECRET=your_32_byte_secret

# Logging
PINO_LOG_LEVEL=info
DISABLE_FILE_LOGS=true
```

---

## 2. Security Framework

### Authentication (Auth0)
**Simple Cookie-Based Authentication**:
- Single authentication method using Auth0 SDK cookies
- All routes (pages and API) protected by the same session mechanism
- No token complexity needed for single-user system

#### Implementation
1. **Middleware Protection** (`src/middleware.ts`):
   - Use `withMiddlewareAuthRequired` to protect all app routes except static assets
   - Cookie-based session validation for both page and API access

2. **Session Security**:
   - Rotate `AUTH0_SECRET` on schedule
   - Secure cookie settings: `secure: true`, `SameSite=Lax`, `HttpOnly: true`
   - Session expires after inactivity (Auth0 default: 24 hours)

3. **API Access**:
   - Same session cookies used for API endpoints
   - No separate token validation needed
   - Simpler implementation and maintenance

### Authorization & Route Access

| Route | Methods | Access | Notes |
|-------|---------|--------|-------|
| **Health & System** |
| `/api/health` | GET | Public | Database status, system metrics (no sensitive data) |
| **Employees** |
| `/api/employees` | GET, POST | Authenticated | Configuration UI access |
| `/api/employees/[id]` | GET, PUT, DELETE | Authenticated | Profile management, restrict DELETE to deactivate |
| **Rooms & Tables** |
| `/api/rooms` | GET | Authenticated | Read room list |
| `/api/rooms/[roomId]/tables` | GET | Authenticated | Floor plan data |
| `/api/tables` | GET | Authenticated | All active tables |
| `/api/tables/[tableId]` | PUT | Authenticated | Position updates, validate payload |
| **Reservations** |
| `/api/reservations` | GET | Authenticated | Paginated: limit≤200, default offset=0 |
| `/api/reservations` | POST | Authenticated | Create reservation, return TABLE_UNAVAILABLE on conflicts |
| `/api/reservations/[id]` | GET, PUT, DELETE | Authenticated | CRUD operations with activity logging |
| `/api/reservations/auto-complete` | POST | Authenticated | Maintenance operation |
| **Availability & Logs** |
| `/api/availability` | GET | Authenticated | Table availability check |
| `/api/activity-logs` | GET | Authenticated | Activity page access |
| `/api/activity-logs/[reservationId]` | GET | Authenticated | Reservation history |
| `/api/activity-logs/cleanup` | POST | Authenticated | Maintenance endpoint, enforce bounds 1..12 |

### Security Headers
Configure in `next.config.ts`:

```ts
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://*.auth0.com",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

export async function headers() {
  return [{ source: '/:path*', headers: securityHeaders }];
}
```

### CORS Policy
- **Same-origin only**: No `Access-Control-Allow-Origin: *`
- Cookie-based auth with `SameSite=Lax` provides CSRF protection
- Same-origin policy prevents session leakage

**Note**: Rate limiting omitted for single-user system - Render provides DDoS protection at infrastructure level.

---

## 3. Application Security

### Input Validation (Zod)
Centralize validation schemas in `src/lib/validation/`:

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
```

### Error Handling
**Standardized error responses**:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid reservation payload" } }
```

**Security safeguards**:
- Disable stack traces in production (`NODE_ENV=production`)
- Never expose database schema details or internal paths
- Generic HTTP 500 fallback with server-side logging only
- Set timeouts on database/external calls
- Map known service errors to appropriate HTTP status codes

### Logging & Privacy
**Simplified Pino setup**:
```ts
export const logger = pino({
  level: process.env.PINO_LOG_LEVEL || 'info',
  // Optional: Basic PII redaction for phone numbers
  redact: {
    paths: ['guest_phone', 'reservation_snapshot.guest_phone'],
    censor: '[REDACTED]'
  }
});
```

**Logging practices**:
- Structured JSON to stdout only (Render captures automatically)
- Keep `pino-pretty` as dev-only convenience
- Production level: `info` (minimal logging for debugging when needed)
- Avoid logging sensitive data and large objects

### Activity Logs
**Content**: Full reservation snapshots (contains PII)
**Retention**: Manual cleanup via `/api/activity-logs/cleanup` endpoint
**Privacy**: Consider hashing/anonymizing sensitive data in snapshots

---

## 4. API Documentation

### Request/Response Standards
- All route handlers use Zod validation on request bodies/queries
- UUID primary keys throughout (no exposed incremental IDs)
- Parameterized SQL only (no string concatenation)
- Server-side date normalization (`normalizeDateForDb`)

### Pagination Requirements
- `/api/reservations`: Enforce `limit <= 200`, default `offset = 0`
- Future: Consider adding pagination to activity logs

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request payload |
| `TABLE_UNAVAILABLE` | 409 | Reservation conflict |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `UNAUTHORIZED` | 401 | Invalid/missing Auth0 session |
| `INTERNAL_ERROR` | 500 | Generic server error |

### Health Check Endpoint
Implement `/api/health` for Render monitoring:

```ts
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/database';

export async function GET() {
  const health = await healthCheck();
  const status = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json({
    status: health.status,
    timestamp: new Date().toISOString(),
    database: {
      connected: health.status === 'healthy',
      pool_total: health.details.total_connections,
      pool_idle: health.details.idle_connections
    }
  }, { status });
}
```

---

## 5. Operational Procedures

### Deployment Workflow
1. **Pre-deployment**:
   - Run `npm audit` and address critical vulnerabilities
   - Verify package-lock.json is committed
   - Test with staging database

2. **Database Setup**:
   - Create `app_user` with minimal privileges (SELECT, INSERT, UPDATE, DELETE on app tables)
   - Run schema migrations with admin credentials
   - Verify SSL connection requirements

3. **Application Deployment**:
   - Use `npm ci` for exact dependency installation
   - Set environment variables in Render dashboard
   - Configure health check endpoint `/api/health`

### Maintenance Tasks
**Regular operations**:
- Monitor Render application logs for errors
- Clean activity logs via `/api/activity-logs/cleanup`
- Verify daily database backups

**Administrative scripts** (run locally with admin credentials):
- Schema migrations (`npm run apply-schema`)
- Database seeding (`npm run seed-db`)
- Maintenance commands (`npm run clean-logs`)

### Health Monitoring
- **Render automatic monitoring**: Built-in health checks and restart policies
- **Custom health endpoint**: `/api/health` for database status verification
- **Simple logging**: Monitor stdout logs through Render dashboard

---

## 6. Production Implementation Checklist

### Auth0 Setup
- [ ] Create Auth0 tenant and configure application (SPA type)
- [ ] Set callback URLs for Render domain
- [ ] Configure session timeout and security settings
- [ ] Generate and secure `AUTH0_SECRET` (32+ characters)

### Application Security
- [ ] Implement `src/middleware.ts` with `withMiddlewareAuthRequired`
- [ ] Add security headers to `next.config.ts` (HSTS, CSP, X-Frame-Options)
- [ ] Create `src/lib/validation/` with Zod schemas for all API endpoints
- [ ] Implement standardized error responses with proper HTTP status codes
- [ ] Add `/api/health` endpoint for monitoring

### Database Security
- [ ] Create `app_user` role with minimal privileges (SELECT, INSERT, UPDATE, DELETE)
- [ ] Configure SSL-required connections in production
- [ ] Set up separate admin credentials for migrations
- [ ] Test backup and restore procedures

### Render Deployment
- [ ] Configure environment variables in Render dashboard
- [ ] Set Node.js version to 22.19.0
- [ ] Configure health check to use `/api/health`
- [ ] Deploy with automatic deploys from main branch
- [ ] Verify Auth0 integration works end-to-end

### Post-Deployment Verification
- [ ] Test complete authentication flow
- [ ] Verify all API endpoints require authentication
- [ ] Test reservation creation and conflict handling
- [ ] Confirm health monitoring is working
- [ ] Run security audit with `npm audit`

---

## 7. Secure Coding Standards

**Authentication**:
- Validate Auth0 session on every request (pages and API)
- Never bypass session validation for "convenience"
- Use middleware for consistent route protection

**Data handling**:
- Use Zod for all input validation (no `any` types)
- Parameterized SQL queries only (already implemented)
- Normalize dates server-side consistently (already implemented)

**Error management**:
- Never leak `error.message` from database to clients
- Map internal errors to standardized public codes
- Log full context server-side for debugging

**Security practices**:
- Prefer UUID for external identifiers (already implemented)
- Validate all user inputs at API boundaries
- Use least-privileged database connections
- Rotate Auth0 secrets on schedule

---

*This document covers expected production behavior and security requirements for the Restaurant Booking System.*