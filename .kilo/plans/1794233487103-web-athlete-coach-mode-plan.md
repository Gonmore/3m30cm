# Plan: Coach Mode in `web-athlete`

## Goal
Extend `apps/web-athlete` (React 19 + Vite PWA) so it serves athletes and coaches in one app, supporting retirement of `apps/web` coach/admin UX.

## Locked decisions
1. **`ProgramTemplate` schema**: add `objective String?`, `displayPriceCents Int?`, `currency String? @default("ARS")`, `usesPhases Boolean @default(false)`. Keep `isPremium`. Expected revenue is **display-only**: `approvedAssignmentCount × displayPriceCents`, counting `ProgramAssignment.status = APPROVED` for the template.
2. **Exercise editing scope (coaches)**: coaches edit **task-level/template-level** data only in templates they own — phases/days, `ExerciseTaskTemplate`/`ExerciseTaskVariant` fields (name, sets, reps/time, rest/duration/load/notes per schema, description, weight/unilateral/evolution/zone), ordering, pick/link existing `Exercise`, set task `videoUrl` (YouTube/external) and upload/attach S3 media for coach-owned template/task/technique assets. **Global `Exercise` catalog CRUD/media remains SUPERADMIN-only** (`admin-exercises`).
3. **Solicitudes scope**: coach sees pending `ProgramAssignment`s for templates they own; SUPERADMIN can view all (with optional filters).
4. **API shape**: add coach-scoped template editor endpoints with ownership enforcement; do not widen `admin-templates`/`admin-exercises` to coaches. Reuse/extract shared editor logic where safe.

## Recommended decisions (apply unless repo constraints require otherwise)
- **View mode**: explicit client mode `athlete | coach`, persisted in `localStorage` keyed by user id. Toggle visible only for `COACH`/`SUPERADMIN`. Default `athlete` when athlete context exists; API still enforces roles. A COACH with `AthleteProfile` can switch shells.
- **`usesPhases` behavior**: editor sets `usesPhases=true` when phased wizard structure is used; generation/reads use phases when `usesPhases` or `phases.length > 0` (backward compatible).
- **S3 uploads**: reuse MinIO helpers; coach uploads allowed only for coach-owned template/technique/task media targets via new coach-authorized endpoints with MIME/size validation.

## Current state (reference)
- Schema: `User.platformRole ATHLETE|COACH|TEAM_ADMIN|SUPERADMIN` (`apps/api/prisma/schema.prisma:10-15,112`). `ProgramTemplate` has `coachId`, `isPremium`, `welcomeVideoUrl`, wizard relations; no objective/price/currency/usesPhases. `ProgramAssignment` has `PENDING|APPROVED|REJECTED`.
- API: `coach.ts` has dashboard/programs/requests-per-template/approve/reject/athletes/progress/sessions/notes with `resolveCoachId` (`?coachUserId` for SUPERADMIN). `admin-templates.ts`/`admin-exercises.ts` are SUPERADMIN-only. `athlete.ts` handles available programs + premium requests/assignments. No endpoint updates `User.platformRole`.
- Web: `App.tsx` guards `/coach*` for `COACH|SUPERADMIN`; `Layout`/`Sidebar` are athlete-oriented with a single coach link. Coach screens exist but are limited (`CoachPrograms` read-only; `CoachDashboard` mixes coach/athlete assignment data; `CoachAthleteProgress` uses mismatched athlete endpoint).

## Implementation plan

### 1) Schema & migration (API)
**Files**: `apps/api/prisma/schema.prisma`, new Prisma migration.
- Add to `ProgramTemplate`: `objective String?`, `displayPriceCents Int?`, `currency String? @default("ARS")`, `usesPhases Boolean @default(false)`.
- Run repo migration workflow + `npx --prefix apps/api run prisma:generate`.
- Update any template create/update Zod schemas and select/include shapes that surface templates (`coach.ts`, `admin-templates.ts`, `athlete.ts` available-program responses).

### 2) SUPERADMIN user/coach management API
**Files**: `apps/api/src/routes/admin-teams.ts` or new `apps/api/src/routes/admin-users.ts`, router mount in `apps/api/src/app`/route index.
- `GET /admin/users` (SUPERADMIN): search/list users with `platformRole`, team memberships, basic profile; pagination/filter.
- `PATCH /admin/users/:userId/role` (SUPERADMIN): set `platformRole` (grant/revoke `COACH`; allow `ATHLETE`/`TEAM_ADMIN`/`SUPERADMIN` only with explicit safeguards). Prevent accidental self-demotion from SUPERADMIN without confirmation guard/explicit override. Write `AuditLog`.
- Reuse auth middleware; do not expose to non-SUPERADMIN.

### 3) Coach template editor API (ownership-enforced)
**Files**: new `apps/api/src/routes/coach-templates.ts` (mounted `/coach/program-templates` or similar), shared helpers in `apps/api/src/lib/program-template-editor.ts` / `program-template-permissions.ts` as needed; minimal touch to `admin-templates.ts` for shared extraction only.
- Auth: `requireAuth`, `requireRole([COACH,SUPERADMIN])`.
- Ownership helper: coach can access only `template.coachId === auth.sub`; SUPERADMIN can access any and may pass `coachUserId`/scope where useful.
- Endpoints (v1, matching editor needs):
  - `GET /` list templates. Coach: own. SUPERADMIN: all, filters (`coachUserId`, `q`, `isPremium`). Include `_count`/computed `approvedAssignmentCount` (`ProgramAssignment` where `status=APPROVED`).
  - `POST /` create template. Coach owner = self; SUPERADMIN may assign `coachId`. Set unique `code`, defaults, new commercial fields.
  - `GET /:id` detail with phases/days/tasks/variants/exercises (task-linked), techniques/media as needed, and `approvedAssignmentCount` + `expectedRevenueCents` (computed).
  - `PUT /:id` update allowed fields: `name, description, objective, welcomeVideoUrl, cycleLengthDays, isPremium, displayPriceCents, currency, usesPhases` (and coach assignment only for SUPERADMIN if needed). Ownership check.
  - Structure/wizard (ownership-checked): phase CRUD, day CRUD, task CRUD/reorder, variant CRUD. Mirror admin-templates request/response shapes where practical to reduce UI mapping risk. Set/maintain `usesPhases`.
  - Task media: accept `videoUrl` (YouTube/external) on tasks. Add coach-authorized S3 upload for template welcome/technique/task media targets owned by coach; persist via existing MinIO/media patterns.
- Do **not** add global `Exercise` create/update/delete for coaches. Provide exercise picker data via existing safe read path or a coach read-only `GET /coach/exercises` search endpoint (no mutations).
- Handle conflicts safely (duplicate code, template with active assignments/programs on destructive actions).

### 4) Coach requests & athlete visibility API
**Files**: `apps/api/src/routes/coach.ts` (or split into `coach-requests.ts`).
- `GET /coach/requests`: aggregate pending assignments. Coach: templates owned; SUPERADMIN: all or filtered. Include athlete profile/user, template commercial fields, request notes, timestamps.
- Keep existing `POST /coach/assignments/:id/approve|reject`; verify they remain correct with revenue counts (counts derived, no stored revenue).
- `GET /coach/athletes`/progress: ensure SUPERADMIN can view global athletes (or all athletes connected to programs) per product intent; define scope clearly (recommended: SUPERADMIN sees all athletes with relevant assignment/program context; COACH sees athletes of owned programs/assignments). Add/adjust queries and guards.

### 5) Web-athlete view mode & shell
**Files**: `apps/web-athlete/src/contexts/AuthContext.tsx` (or new `src/contexts/ViewModeContext.tsx`), `src/App.tsx`, `src/components/Layout.tsx`, `src/components/Sidebar.tsx`, possibly `src/components/Header`/shared nav components.
- Add `useViewMode()` with `viewMode`, `setViewMode`, `canCoachMode`, `isSuperAdmin`; persist per user id; reset on logout/user change.
- Update route structure: athlete routes remain; coach routes become `/coach`, `/coach/programas`, `/coach/programas/nuevo`, `/coach/programas/:id`, `/coach/atletas`, `/coach/atletas/:athleteId`, `/coach/solicitudes`, `/coach/entrenadores` (SUPERADMIN). Guards enforce role + (where needed) superadmin-only subroutes.
- Sidebar/Layout nav by mode:
  - Athlete: current menu + toggle to coach (if eligible).
  - Coach: `Programas`, `Atletas`, `Solicitudes`, plus `Entrenadores` for SUPERADMIN + toggle back to athlete.
- Fix existing mismatches: `CoachDashboard` should use coach APIs (not `/athlete/assignments` semantics unless intentional); `CoachAthleteProgress` should call the correct coach progress endpoint/shape.

### 6) Web-athlete coach feature screens
**Files**: new/updated routes under `apps/web-athlete/src/routes/` (e.g. `CoachPrograms.tsx` rewrite, `CoachProgramEditor.tsx`, `CoachAthletes.tsx`, `CoachAthleteProgress.tsx` fix, `CoachRequests.tsx`, `CoachTrainers.tsx`), shared components/forms, `src/types/api.ts`, API client usage.
- **Programas**: list cards/table with name, objective, fases/premium, display price, approved users, expected revenue. Create/edit actions.
- **Editor**: base fields + phased/day/task/variant builder. Exercise picker uses read-only search of existing exercises; task media supports YouTube URL and S3 upload per Phase 3. Mobile-first layout.
- **Atletas**: list + detail/progress/evolución view using coach APIs.
- **Solicitudes**: pending queue, approve/reject, show template/revenue context.
- **Entrenadores** (SUPERADMIN): user search/list and `platformRole` grant/revoke COACH via Phase 2 endpoint.

### 7) Types, docs, cleanup
**Files**: `apps/web-athlete/src/types/api.ts`, `ARCHITECTURE.md`, `api_reference.md`, `bitacora.md`.
- Extend template/assignment/coach DTO types for commercial fields and `approvedAssignmentCount`/computed revenue where returned.
- Document new endpoints, permissions, and coach-mode behavior.
- Note: `apps/web` retirement is enabled by parity; actual removal/cutover is a separate, explicit step.

## Validation
- API: Prisma generate/migrate; `npx --prefix apps/api run ts:check` (or repo typecheck script); smoke test ownership (coach cannot read/mutate others’ templates), SUPERADMIN override, request approve/reject, and role grant.
- Web: `npx --prefix apps/web-athlete tsc --noEmit` and `npm run --prefix apps/web-athlete build`.
- Manual matrix:
  - `ATHLETE`: no coach toggle/nav; athlete flows unchanged.
  - `COACH`: toggle athlete↔coach; manage only own programs; see own athletes/requests; cannot access Entrenadores or global exercise mutations.
  - `SUPERADMIN`: toggle; all programs/users/requests visibility; create programs for/with coach context as defined; assign coach role.
- Regression: premium request → pending → approve creates personal program; onboarding/program generation; PWA reminders/timer/onboarding.

## Risks
- `admin-templates.ts` wizard logic is complex; extract only needed shared pieces incrementally to avoid regressions in import/variants/biomechanics paths not required for v1.
- Ownership checks must be server-side on every mutation (template id/code, nested phase/day/task/variant ids).
- Expected revenue denominator is locked to **APPROVED assignments**; UI should label it clearly as expected/display-only.
- S3 upload authorization must bind uploaded objects to coach-owned resources.