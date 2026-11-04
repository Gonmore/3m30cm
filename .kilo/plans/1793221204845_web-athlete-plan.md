# Plan: Web Athlete App + Coach System

## Objetivo
Implementar `apps/web-athlete/` replicando la experiencia de `mobile2` para atletas, con sistema de solicitud/aprobación de programas por parte del coach.

---

## Modelo de Datos (Cambios)

### ProgramTemplate (nuevo campo)
```prisma
model ProgramTemplate {
  // ... campos existentes
  isPremium  Boolean @default(false)  // programa gratuito vs restringido
  coachId    String?                     // coach propietario del template
  coach      User? @relation("CoachTemplates", fields: [coachId], references: [id])
}
```

### Nuevo modelo ProgramAssignment
```prisma
enum AssignmentStatus {
  PENDING    // solicitado, espera aprobación
  APPROVED   // coach aprobó, generar PersonalProgram
  REJECTED   // coach rechazó
}

model ProgramAssignment {
  id               String   @id @default(cuid())
  athleteProfileId String
  templateId       String
  coachId          String
  status           AssignmentStatus @default(PENDING)
  requestNotes     String?            // notas del atleta
  approvedAt       DateTime?
  assignedAt       DateTime @default(now())
  
  athleteProfile   AthleteProfile @relation(fields: [athleteProfileId], references: [id])
  template         ProgramTemplate @relation(fields: [templateId], references: [id])
  coach            User @relation("CoachAssignments", fields: [coachId], references: [id])
}
```

---

## Flujo de Usuarios

### Atleta - Programa Gratuito
1. Registro/Login → `/api/v1/auth/register/athlete` o `/api/v1/auth/login`
2. Onboarding → `/api/v1/athlete/onboarding`
3. Programas disponibles → `/api/v1/templates` (solo isPremium = false)
4. Selecciona → PersonalProgram creado automáticamente
5. Dashboard → sesión del día, progreso

### Atleta - Programa Premium
1-3. Igual
4. **Solicitar programa** → `POST /api/v1/athlete/programs/request`
5. **Esperar aprobación** → Estado PENDING en UI
6. **Coach aprueba** → PersonalProgram creado
7. **Acceso al programa**

### Coach
1. Dashboard → Lista atletas y estadísticas
2. Ver solicitudes → `GET /api/v1/coach/programs/:id/requests`
3. Aprobar/Rechazar → Notas motivacionales
4. Ver progreso → Métricas, sesiones completadas

### Admin (Superadmin)
1. Crear Templates → `POST /api/v1/admin/templates`
2. Configurar premium → `isPremium = true`
3. Asignar coach → `PUT /api/v1/admin/templates/:code`

---

## API Endpoints a Crear

### Athlete (`apps/api/src/routes/athlete.ts`)
- `GET /api/v1/athlete/programs/available` - templates con isPremium, coach
- `POST /api/v1/athlete/programs/request` - solicitar programa premium
- `GET /api/v1/athlete/assignments` - estado de solicitudes
- `GET /api/v1/athlete/assignments/:templateId` - detalle

### Coach (`apps/api/src/routes/coach.ts`)
- `GET /api/v1/coach/programs` - mis plantillas
- `GET /api/v1/coach/programs/:programId/requests` - solicitudes
- `POST /api/v1/coach/assignments/:id/approve` - aprobar → crea PersonalProgram
- `POST /api/v1/coach/assignments/:id/reject` - rechazar con notas
- `GET /api/v1/coach/athletes` - mis atletas con programas
- `GET /api/v1/coach/athletes/:athleteId/progress` - progreso detallado
- `GET /api/v1/coach/sessions` - sesiones filtrables
- `POST /api/v1/coach/sessions/:sessionId/notes` - notas del coach

### Templates (`apps/api/src/routes/templates.ts`)
- `GET /api/v1/templates` - incluir isPremium, coachId
- `GET /api/v1/templates/:code` - incluir isPremium

---

## Web Application Structure (`apps/web-athlete/`)

```
apps/web-athlete/
  ├─ package.json         # React 19, Vite, Tailwind, Zod, TanStack Query
  ├─ vite.config.ts
  ├─ tailwind.config.js   # colores: bg=#0A1628, amber=#E8A838, teal=#2CC490
  ├─ src/
  │  ├─ main.tsx
  │  ├─ App.tsx           # React Router v6
  │  ├─ routes/
  │  │  ├─ login.tsx      # Auth form
  │  │  ├─ register.tsx   # Registration
  │  │  ├─ dashboard/     # Home atleta
  │  │  ├─ programs/      # Lista programas
  │  │  ├─ sessions/      # Lista + detalle sesiones
  │  │  ├─ progress/      # Estadísticas
  │  │  └─ settings/      # Perfil
  │  ├─ components/
  │  │  ├─ AuthProvider.tsx
  │  │  ├─ ApiProvider.tsx
  │  │  └─ ...
  │  └─ lib/
  │     ├─ api.ts         # API client con interceptors
  │     └─ auth.ts        # Helpers JWT decode
  └─ app.json             # { slug: "web-athlete", apiBaseUrl: "..." }
```

### dependencias principales
```json
{
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "react-router-dom": "^6.x",
  "vite": "^6.x",
  "tailwindcss": "^3.x",
  "zod": "^3.x",
  "@tanstack/react-query": "^5.x",
  "@jump/shared": "file:../.."
}
```

---

## Tareas de Implementación

### Paso 1: Schema & Migration
- [ ] Verificar si hay migration existente para ProgramTemplate
- [ ] Agregar `isPremium`, `coachId` a ProgramTemplate
- [ ] Crear modelo `ProgramAssignment`
- [ ] Crear migration y generar client Prisma

### Paso 2: Backend - Endpoints
- [ ] Implementar `athlete.ts` - endpoints de request/assignments
- [ ] Implementar `coach.ts` - ampliar con assignments/approve
- [ ] Actualizar `templates.ts` - incluir isPremium/coachId
- [ ] Tests: verificar que atleta no puede tener 2 programas ACTIVE

### Paso 3: Frontend - web-athlete
- [ ] Crear `apps/web-athlete/` con package.json
- [ ] Configurar Vite + Tailwind + React Router
- [ ] Implementar AuthProvider con JWT decoding
- [ ] Crear rutas login/register
- [ ] Crear ProgramList con filtros (gratis/premium)
- [ ] Implementar solicitud de programa

### Paso 4: Coach Workflow
- [ ] Dashboard atletas
- [ ] Lista solicitudes con estado
- [ ] Botón Aprobar/Rechazar
- [ ] Ver detalle atleta y progreso

---

## Validación

### Backend Tests
1. `POST /api/v1/athlete/programs/request` → Assignment PENDING
2. `GET /api/v1/coach/programs` → solo templates del coach
3. `POST /api/v1/coach/assignments/:id/approve` → crea PersonalProgram
4. Verificar que atleta con programa ACTIVE no puede solicitar otro

### Frontend Tests
1. Login → redirección a dashboard
2. Ver programas → diferenciar gratuito/premium
3. Solicitar premium → ver PENDING en lista
4. Coach aprueba → refrescar → ver programa activo

---

## Archivos Clave

- `.kilo/plans/1793221204845_web-athlete-plan.md` ← Este plan
- `apps/api/prisma/schema.prisma` - cambios de schema
- `apps/api/src/routes/athlete.ts` - nuevos endpoints
- `apps/api/src/routes/coach.ts` - ampliar endpoints
- `apps/web-athlete/package.json` - dependencias nuevas
- `packages/shared/src/index.ts` - tipos reutilizables

---

## Próximos Pasos Inmediatos

1. Ejecutar: `npx prisma migrate dev --name add_program_assignment_and_premium_flag`
2. Implementar endpoints en `athlete.ts` y `coach.ts`
3. Crear workspace `apps/web-athlete/`
4. Configurar AuthProvider con JWT decoding

---

*Plan: 2026-10-30*
*Estado: Listo para implementación*