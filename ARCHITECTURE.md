# 3m30cm Platform — Architecture

## Overview

The 3m30cm platform is a monorepo containing a REST API backend, a React admin web panel, and an Expo SDK 54 React Native mobile client. All three are built on a shared PostgreSQL database with Prisma ORM.

```
┌─────────────────────────────────────────────────────────┐
│                        Clients                           │
│                                                          │
│  ┌──────────────┐    Bearer JWT    ┌────────────────┐  │
│  │  Web Admin   │ ◀─────────────── │   Mobile2      │  │
│  │ (React 19)   │                  │ (Expo SDK 54)  │  │
│  │  Vite Dev    │                  │     Native     │  │
│  └──────┬───────┘                  └───────┬──────────┘  │
│         │                                  │              │
│         └─────────── HTTPS /api/v1 ──────────┘            │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │
                          ▼
       ┌──────────────────────────────────┐
       │        API Server (Docker)       │
       │  Express.js + Prisma + PostgreSQL │
       │  Port 4100  (healthcheck /health) │
       └──────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
    ┌─────────┐    ┌────────────┐    ┌──────────────┐
    │  Postgres│    │   MinIO    │    │ Google OAuth │
    │  DB      │    │ (S3 Asset) │    │  (ID Token)  │
    └─────────┘    └────────────┘    └──────────────┘
```

## Monorepo Layout

```
3m30cm-platform/                   # npm workspaces root
├── package.json                   # workspace config; scripts dev:api, dev:web, dev:mobile2
├── docker-compose.local.yml       # local dev compose (api:4100, web:4173)
├── .env                           # env vars (DB_URL, JWT secrets, WEB_URL, MINIO, OAuth)
├── prisma/  (or apps/api/prisma/) # Prisma schema + migrations
│
├── apps/
│   ├── api/                       # Express REST API  — package @jump/api
│   │   ├── src/
│   │   │   ├── app.ts             # Express app (CORS, helmet, JSON, router mount /api/v1)
│   │   │   ├── config/prisma.ts   # Prisma client
│   │   │   ├── middleware/auth.ts # requireAuth, requireRole (Bearer JWT)
│   │   │   ├── lib/auth.ts        # JWT create/verify, Google ID token verify
│   │   │   ├── lib/minio.ts       # S3-compatible asset storage
│   │   │   ├── lib/env.ts         # Zod-validated env schema
│   │   │   └── routes/            # route modules (see API Endpoints below)
│   │   ├── prisma/schema.prisma   # data model
│   │   ├── Dockerfile             # dev (tsx watch)
│   │   ├── Dockerfile.prod        # prod multi-stage
│   │   └── package.json
│   │
│   ├── web/                       # Web Admin Panel  — package @jump/web
│   │   ├── src/
│   │   │   └── App.tsx            # monolithic client (~5000+ lines, Vite + React 19)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── Dockerfile             # dev (sh -c npm install ... npm run dev)
│   │   ├── Dockerfile.prod        # prod build
│   │   ├── nginx.conf             # production nginx config
│   │   └── package.json
│   │
│   ├── mobile/                    # Legacy Expo app — shared components/tokens for mobile2
│   │   ├── components/tokens.ts
│   │   ├── components/ThemeContext.tsx
│   │   └── components/runtimeConfig.ts  # apiBaseUrl, asset URL rewriting
│   │
│   └── mobile2/                   # Primary mobile client — Expo SDK 54 (React Native)
│       ├── app/
│       │   ├── App.tsx            # Expo Router root (ExpoRoot)
│       │   ├── _layout.tsx        # Expo Router layout
│       │   └── index.tsx          # main entry; requestJson helper, auth, screens
│       ├── components/
│       │   ├── screens/           # HoyScreenV2, TecnicaScreen, NutricionScreen,
│       │   │                     #   PathToDunkScreen, EvolucionCombinedScreen
│       │   └── technique/         # athleteTechniqueAnalysis (biomechanics analyze)
│       ├── app.json / app.config.js
│       ├── babel.config.js
│       ├── eas.json
│       └── package.json
│
└── packages/
    └── shared/src/index.ts        # shared types & constants (appMetadata, platformRoles, etc.)
```

## Backend API

**Stack:** Node.js 20+, Express, Prisma, PostgreSQL, MinIO (S3-compatible asset storage).

**Boot:** Express app in `apps/api/src/app.ts` — CORS origin `env.WEB_URL`, Helmet security, JSON body parsing. All routes mounted at `/api/v1` via `apps/api/src/routes/index.ts`.

**Auth:** Bearer JWT in `Authorization` header. Middleware in `apps/api/src/middleware/auth.ts`:
- `requireAuth` — verifies JWT access token (via `lib/auth.ts` `verifyAccessToken`)
- `requireRole([...])` — checks `platformRole` (SUPERADMIN, COACH, ATHLETE)

Google OAuth: clients verify Google ID token on-device, call `/api/v1/auth/google` to exchange for a platform JWT.

**Route modules** (all under `/api/v1`):

| Route prefix        | Module                  | Key endpoints |
|---------------------|-------------------------|---------------|
| `/auth`             | `auth.ts`               | `POST /login`, `POST /register/athlete`, `POST /google`, `POST /forgot-password`, `POST /reset-password`, `GET /me` |
| `/athlete`          | `athlete.ts`            | `/dashboard`, `/me`, `/programs`, `/sessions`, `/progress`, `/technique`, `/sessions/auto-rollover`, `/sessions/:id/exercise-load-hints`, `/exercise-loads`, `/onboarding`, `/programs/generate`, `/technique/metrics`, `/program-templates/:code/techniques/:id/biomechanics/analyze`, `/weekly-checkin`, `/weekly-checkin/weekend-games` |
| `/coach`            | `coach.ts`              | `GET /dashboard` (requires COACH or SUPERADMIN) |
| `/admin`            | `admin.ts`              | `GET /summary` + sub-routers (see below) |
| `/admin/exercises`  | `admin-exercises.ts`    | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /populate-gifs/search`, `POST /populate-gifs/translate`, `POST /populate-gifs/apply` |
| `/admin/program-templates` | `admin-templates.ts` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/admin/teams`      | `admin-teams.ts`        | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/admin/programs`   | `admin-programs.ts`     | `GET /`, `GET /:id`, `POST /generate` |
| `/admin/app-configs` | `app-config.ts` (admin variant) | `GET /`, `POST /`, `PUT /:id` |
| `/admin/available-apps` | `app-config.ts`    | `GET /` (directory scan) |
| `/admin/nutrition`  | `admin-nutrition.ts`    | `GET /articles`, `POST /articles`, `GET /tips`, `POST /tips` |
| `/bootstrap`        | `bootstrap.ts`          | `GET /` (initial app config data) |
| `/catalog`          | `catalog.ts`            | `GET /exercises` (public catalog) |
| `/templates`        | `templates.ts`          | `GET /program-templates` (public, no auth) |
| `/nutrition`        | `nutrition.ts`          | `GET /articles`, `GET /tips/random` |
| `/app-config`       | `app-config.ts`         | `GET /:slug` (public app config) |
| `/assets/:bucket/*` | `assets.ts`             | `GET /:bucket/*` (MinIO proxy/rewrite) |
| `/health`           | `health.ts`             | `GET /health` (healthcheck) |

**Database:** PostgreSQL per `.env` `DATABASE_URL`. Schema in `apps/api/prisma/schema.prisma` (User, AthleteProfile, Coach, Team, ProgramTemplate, PersonalProgram, ScheduledSession, Exercise, NutritionArticle, etc.).

**Asset storage:** MinIO S3-compatible. Asset route `/api/v1/assets/:bucket/:key` proxies/rewrites URLs. Both frontends use `rewriteLocalAssetUrl` from `apps/mobile/components/runtimeConfig.ts` to normalize asset URLs (local MinIO ports → API asset route).

## Web Admin (apps/web)

**Stack:** Vite dev server, React 19, TypeScript. Built with `pnpm run build --workspace @jump/web` (or npm workspace equivalent), production served via nginx.

**API config:** Base URL from `import.meta.env.VITE_API_BASE_URL` (see `apps/web/src/App.tsx:15`). In dev, Vite proxies `/api` to the API container. The full monolithic `App.tsx` contains all screens and the `requestJson` helper.

**Auth:** JWT stored in `localStorage` under key `"jump-admin-access-token"`. Passed as `Authorization: Bearer <token>`.

**Endpoints consumed:**
- `/api/v1/auth/me` — current user check
- `/api/v1/admin/summary` — dashboard metrics
- `/api/v1/admin/exercises` — CRUD + populate-gifs workflow (search/translate/apply)
- `/api/v1/admin/program-templates` — CRUD
- `/api/v1/admin/teams` — CRUD
- `/api/v1/admin/athletes` — list athletes
- `/api/v1/admin/programs` — list + generate (`POST /generate`)
- `/api/v1/admin/app-configs` — CRUD
- `/api/v1/admin/available-apps` — directory scan for app slugs
- `/api/v1/admin/nutrition/articles` — CRUD
- `/api/v1/admin/nutrition/tips` — CRUD
- `/api/v1/auth/login` — sign in

## Mobile2 (apps/mobile2)

**Stack:** Expo SDK 54, React Native, TypeScript, Expo Router. Built with EAS (`eas.json`).

**API config:** `apiBaseUrl` injected via Expo config extra (`app.json` `extra.apiBaseUrl`, default `https://3m30cm.supernovatel.com`). Overridable via env `EXPO_PUBLIC_API_BASE_URL` / `API_BASE_URL` (see `app.config.js:62`). In local dev, `runtimeConfig.ts` resolves the Metro/Expo Go debugger host IP and swaps to port 4100 for the API and port 9000 for MinIO.

**Shared code:** imports components/tokens from `apps/mobile` via `@mobile/*` path aliases (`@mobile/components/tokens`, `@mobile/components/ThemeContext`, `@mobile/components/runtimeConfig`).

**Auth:** JWT stored in `expo-secure-store`. Google OAuth ID token obtained via `expo-web-browser` / `expo-auth-session`, then exchanged at `/api/v1/auth/google` for a platform JWT.

**Endpoints consumed:**
- `/api/v1/auth/login`, `/api/v1/auth/google`, `/api/v1/auth/register/athlete`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password` — authentication
- `/api/v1/athlete/me`, `/api/v1/athlete/programs`, `/api/v1/athlete/sessions`, `/api/v1/athlete/progress`, `/api/v1/athlete/technique` — athlete dashboard/home screen
- `/api/v1/athlete/sessions/auto-rollover` — session rollover
- `/api/v1/athlete/sessions/:id/exercise-load-hints`, `/api/v1/athlete/exercise-loads` — load hints
- `/api/v1/athlete/onboarding` — onboarding flow
- `/api/v1/athlete/programs/generate` — generate personal program
- `/api/v1/athlete/technique/metrics` — technique metrics
- `/api/v1/athlete/program-templates/:code/techniques/:id/biomechanics/analyze` — biomechanics analysis (`athleteTechniqueAnalysis.ts`)
- `/api/v1/athlete/weekly-checkin`, `/api/v1/athlete/weekly-checkin/weekend-games` — weekly check-in
- `/api/v1/app-config/3m30cm-game` — public app config by slug
- `/api/v1/nutrition/tips/random`, `/api/v1/nutrition/articles`, `/api/v1/nutrition/articles?category=PRE_WORKOUT|POST_WORKOUT|REST_DAY` — nutrition screen
- `/api/v1/templates/program-templates` — public program templates (no auth)

## Local Development

**Docker Compose** (`docker-compose.local.yml`):

| Service      | Container       | Port  | Command                                        | Depends on |
|--------------|-----------------|-------|------------------------------------------------|------------|
| api-3m30cm   | api-3m30cm-dev  | 4100  | npm install, prisma:generate, db:ensure, push, db:seed, dev | —          |
| web-3m30cm   | web-3m30cm-dev  | 4173  | npm run dev -- --host 0.0.0.0 --port 4173      | api (healthcheck) |

- Network: `red-desarrollo` (external Docker network)
- Healthcheck: `wget -q --spider http://127.0.0.1:4100/api/v1/health`
- Volumes: workspace `.` mounted read-write; `/workspace/node_modules` for node_modules isolation
- Run: `docker compose -f docker-compose.local.yml up`

Alternative dev scripts (root `package.json`):
- `npm run dev:api` — API only (no Docker)
- `npm run dev:web` — Web admin only (no Docker)
- `npm run dev:mobile2` — Mobile2 Expo start

**Environment (`.env`):**
- `PORT=4100`
- `WEB_URL=http://localhost:4173`
- `DATABASE_URL` (PostgreSQL)
- `MINIO_*` config (endpoint, access key, secret, bucket)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID_WEB` (and mobile client IDs)
- `MOBILE_APP_SLUG=3m30cm-game`

## Production Deployment

- **API:** `Dockerfile.prod` — multi-stage (build + runtime). Listens on `PORT`.
- **Web:** `Dockerfile.prod` builds static assets; `nginx.conf` serves on port 80/443 behind a reverse proxy.
- **Mobile2:** EAS build (`eas.json`); APK build via `npm run apk:vjump` (see README for stability constraints).
- **Mobile (legacy):** Maintained alongside mobile2; provides shared component library via `@mobile/*` aliases.
- **Database/Migrations:** `prisma:push` for dev, standard Prisma migrations for prod.
- **Assets:** MinIO (S3-compatible) behind the API `/api/v1/assets/:bucket/*` route; public URLs optionally served directly when `MINIO_PUBLIC_BASE_URL` is configured.

## Related Documentation

- `api_reference.md` — detailed API endpoint reference with auth flows and example payloads
- `bitacora.md` — historical decisions log
- `README.md` — project overview and development setup
