# 3m30cm API Reference

> Base URL: `/api/v1`  
> Autenticación: Bearer token en header `Authorization: Bearer <token>`

---

## Autenticación

### POST `/api/v1/auth/register/athlete`

Registra un nuevo atleta.

**Body:**
```json
{
  "email": "string (required)",
  "password": "string, min 8 chars (required)",
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "displayName": "string (optional)",
  "sport": "string (optional)",
  "trainsSport": "boolean (default: false)",
  "sportTrainingDays": "[0-6] array (optional)",
  "seasonPhase": "OFF_SEASON | PRE_SEASON | IN_SEASON | POST_SEASON (default: OFF_SEASON)",
  "availableWeekdays": "[0-6] array (optional)",
  "notes": "string (optional)"
}
```

**Respuesta 201:**
```json
{
  "accessToken": "JWT string",
  "user": { "id", "email", "firstName", "lastName", "platformRole", "teamRoles" },
  "athleteProfile": { "id", "displayName", "sport", "trainsSport", "seasonPhase", "weeklyAvailability", "sportTrainingDays", "notes" }
}
```

**Errores:** `400` payload inválido | `409` email ya existe

---

### POST `/api/v1/auth/login`

**Body:**
```json
{
  "email": "string (required)",
  "password": "string, min 8 chars (required)"
}
```

**Respuesta 200:**
```json
{
  "accessToken": "JWT string",
  "user": { "id", "email", "firstName", "lastName", "platformRole", "teamRoles" }
}
```

**Errores:** `400` payload inválido | `401` credenciales incorrectas

---

### POST `/api/v1/auth/forgot-password`

Solicita un reset para la cuenta indicada. El backend genera un token de enlace y un codigo numerico de 6 digitos reutilizable desde la app.

**Body:**
```json
{
  "email": "string (required)"
}
```

**Respuesta 200:**
```json
{
  "message": "Si existe una cuenta, recibirás un email con instrucciones."
}
```

**Notas operativas:**
- En producción intenta enviar el correo real por SMTP.
- El correo incluye un codigo de 6 digitos, un deep link `jump30cm-game://reset-password?...` y la URL web `${WEB_URL}/reset-password?...`.
- En desarrollo, si el SMTP falla por credenciales inválidas o configuración incompleta, el endpoint mantiene `200` y deja en logs el token, el codigo, el deep link y la URL web para seguir probando el flujo.

---

### POST `/api/v1/auth/reset-password`

Consume un token de reset o un par `email + code` y define una nueva contraseña.

**Body:**
```json
{
  "token": "string (optional)",
  "email": "string (optional when token is present)",
  "code": "string de 6 dígitos (optional when token is present)",
  "newPassword": "string, min 8 chars (required)"
}
```

Se debe enviar `token` o bien `email + code`.

**Respuesta 200:**
```json
{
  "message": "Contraseña actualizada correctamente."
}
```

**Errores:** `400` token/código/payload inválido o expirado

---

### GET `/api/v1/auth/me`

Obtiene el usuario autenticado. **Requiere auth.**

**Respuesta 200:**
```json
{
  "user": { "id", "email", "firstName", "lastName", "platformRole", "memberships": [{ "id", "role", "team": { "id", "name", "slug" } }] }
}
```

---

## Atleta

> Todas las rutas requieren autenticación.  
> Prefijo: `/api/v1/athlete`

### GET `/athlete/profile`
Obtiene el perfil del atleta autenticado con equipo y asignaciones de coach.

### PUT `/athlete/profile`
Actualiza perfil de atleta (displayName, sport, seasonPhase, weeklyAvailability, etc.).

### GET `/athlete/sessions`
Lista las sesiones programadas del atleta.

### GET `/athlete/sessions/:sessionId`
Detalle completo de una sesión: ejercicios, instrucciones, media assets, bloques.

### PATCH `/athlete/sessions/:sessionId`
Actualiza estado de sesión (PLANNED → COMPLETED | SKIPPED), notas.

### GET `/athlete/programs`
Lista los programas personales del atleta.

### GET `/athlete/programs/:programId`
Detalle de un programa personal con sesiones.

### GET `/athlete/technique`
Devuelve la tecnica del programa activo del atleta en dos formas:
- `technique`: bloque legacy basado en la tecnica primaria para compatibilidad.
- `techniques`: arreglo completo de tecnicas del template activo.

Incluye:
- texto tecnico por tecnica
- recursos asociados por tecnica (video, imagen o GIF)
- definiciones de medicion por tecnica
- metricas tecnicas ya registradas por el atleta para ese template, incluyendo `completedSessionsAtMeasurement`

### POST `/athlete/technique/metrics`
Registra una metrica tecnica para el atleta autenticado sobre una tecnica concreta del template activo.

**Body:**
```json
{
  "techniqueId": "string (required)",
  "measurementDefinitionId": "string (optional)",
  "label": "string (optional si se manda measurementDefinitionId)",
  "value": "number (required)",
  "unit": "string (optional)",
  "notes": "string (optional)",
  "recordedAt": "ISO datetime (optional)",
  "isBaseline": "boolean (default: false)"
}
```

---

## Coach

> Requiere role `COACH` o `SUPERADMIN`.  
> Prefijo: `/api/v1/coach`

### GET `/coach/dashboard`
Dashboard del coach: datos de coach, atletas asignados con sus últimos programas y sesiones.

### GET `/coach/athletes`
Lista atletas asignados al coach.

### GET `/coach/athletes/:athleteId`
Detalle de un atleta con perfil, equipo y programas.

### GET `/coach/athletes/:athleteId/sessions`
Sesiones de un atleta específico.

---

## Admin

> Requiere role `SUPERADMIN`.  
> Prefijo: `/api/v1/admin`

### GET `/admin/summary`
Métricas generales: conteo de users, teams, athletes, exercises, templates, programs, sessions.

### GET `/admin/program-templates`
Lista templates de programa con conteos y metadata técnica.

### PUT `/admin/program-templates/:code`
Actualiza metadata del template, incluyendo texto técnico.

**Body parcial soportado:**
```json
{
  "name": "string (optional)",
  "description": "string | null (optional)",
  "techniqueTitle": "string | null (optional)",
  "techniqueDescription": "string | null (optional)",
  "cycleLengthDays": "number (optional)"
}
```

### GET `/admin/program-templates/:code/techniques`
Lista las tecnicas del template, con media y definiciones de medicion.

### POST `/admin/program-templates/:code/techniques`
Crea una tecnica dentro del template.

**Body:**
```json
{
  "title": "string (required)",
  "description": "string | null (optional)",
  "measurementInstructions": "string | null (optional)",
  "comparisonEnabled": "boolean (optional)"
}
```

### PUT `/admin/program-templates/:code/techniques/:techniqueId`
Actualiza titulo, descripcion, instrucciones de medicion o `comparisonEnabled` de una tecnica.

### DELETE `/admin/program-templates/:code/techniques/:techniqueId`
Elimina una tecnica del template.

### POST `/admin/program-templates/:code/techniques/:techniqueId/measurements`
Crea una definicion de medicion para una tecnica.

**Body:**
```json
{
  "label": "string (required)",
  "instructions": "string | null (optional)",
  "allowedUnits": ["cm", "kg", "s"],
  "orderIndex": "number (optional)"
}
```

### PUT `/admin/program-templates/:code/techniques/:techniqueId/measurements/:measurementId`
Actualiza la definicion de medicion de una tecnica.

### DELETE `/admin/program-templates/:code/techniques/:techniqueId/measurements/:measurementId`
Elimina una definicion de medicion.

### POST `/admin/program-templates/:code/techniques/:techniqueId/media`
Sube un recurso tecnico asociado a una tecnica concreta. Usa `multipart/form-data`.

**Campos esperados:**
- `file`: archivo binario requerido
- `kind`: `VIDEO | IMAGE | GIF`
- `title`: string opcional
- `isPrimary`: boolean opcional

### DELETE `/admin/program-templates/:code/techniques/:techniqueId/media/:mediaId`
Elimina un recurso tecnico asociado a una tecnica concreta.

### GET `/assets/:bucket/*`
Sirve assets de ejercicio, avatar o tecnica a traves de la API. Soporta `Range` para video y evita depender de URLs directas de MinIO como `http://localhost:9000/...`.

---

## Admin – Ejercicios

> Requiere `SUPERADMIN`. Prefijo: `/api/v1/admin`

### GET `/admin/exercises`
Lista todos los ejercicios con instrucciones y media assets.

### POST `/admin/exercises`
Crea ejercicio.

**Body:**
```json
{
  "name": "string, min 2",
  "slug": "string, lowercase-dashes",
  "category": "string, min 2",
  "description": "string (optional)",
  "equipment": "string (optional)",
  "requiresLoad": "boolean (default: false)",
  "perLeg": "boolean (default: false)",
  "isBlock": "boolean (default: false)",
  "defaultSeriesProtocol": "NONE | FIXED | PYRAMID | DROP | WAVE | BY_FEEL (default: NONE)",
  "summary": "string, min 2",
  "steps": "string, min 5",
  "safetyNotes": "string (optional)"
}
```

### PUT `/admin/exercises/:slug`
Actualiza un ejercicio por slug.

### POST `/admin/exercises/:slug/media`
Sube media (imagen, GIF, video) para un ejercicio. Multipart form-data, max 20MB.

### DELETE `/admin/exercises/:slug/media/:mediaId`
Elimina un media asset de un ejercicio.

---

## Admin – Equipos

> Requiere `SUPERADMIN`. Prefijo: `/api/v1/admin`

### GET `/admin/teams`
Lista todos los equipos.

### POST `/admin/teams`
Crea equipo.

**Body:**
```json
{
  "name": "string, min 2",
  "slug": "string, lowercase-dashes",
  "description": "string (optional)"
}
```

### GET `/admin/teams/:slug`
Detalle de un equipo con miembros y atletas.

### POST `/admin/teams/:slug/members`
Agrega miembro (COACH o TEAM_ADMIN) al equipo.

**Body:**
```json
{
  "email": "string",
  "password": "string, min 8 (optional)",
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "role": "COACH | TEAM_ADMIN"
}
```

### POST `/admin/teams/:slug/athletes`
Agrega atleta al equipo.

**Body:**
```json
{
  "email": "string",
  "password": "string, min 8 (optional)",
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "displayName": "string (optional)",
  "sport": "string (optional)",
  "trainsSport": "boolean",
  "sportTrainingDays": "[0-6] array (optional)",
  "seasonPhase": "OFF_SEASON | PRE_SEASON | IN_SEASON | POST_SEASON",
  "availableWeekdays": "[0-6] array (optional)",
  "notes": "string (optional)"
}
```

### POST `/admin/teams/:slug/athletes/:athleteId/assign-coach`
Asigna coach a atleta.

**Body:**
```json
{
  "coachUserId": "string"
}
```

---

## Admin – Plantillas de Programa

> Requiere `SUPERADMIN`. Prefijo: `/api/v1/admin`

### POST `/admin/program-templates`
Crea plantilla de programa.

**Body:**
```json
{
  "name": "string, min 2",
  "code": "string, UPPERCASE-DASHES, min 2",
  "description": "string (optional)",
  "cycleLengthDays": "number, 1-365 (default: 14)"
}
```

### PUT `/admin/program-templates/:code`
Actualiza plantilla (name, description, cycleLengthDays).

### PUT `/admin/program-templates/:code/days/:dayNumber`
Crea o actualiza un día de la plantilla.

**Body:**
```json
{
  "title": "string, min 1",
  "dayType": "TRAINING | REST | ACTIVE_RECOVERY | TESTING | SPORT",
  "notes": "string (optional)"
}
```

### PUT `/admin/program-templates/:code/days/:dayNumber/prescriptions`
Reemplaza las prescripciones de un día.

**Body:**
```json
{
  "prescriptions": [{
    "exerciseId": "string",
    "orderIndex": "number",
    "seriesProtocol": "NONE | FIXED | PYRAMID | DROP | WAVE | BY_FEEL",
    "blockLabel": "string (optional)",
    "sets": "number (optional)",
    "repsText": "string (optional)",
    "durationSeconds": "number (optional)",
    "restSeconds": "number (optional)",
    "loadText": "string (optional)",
    "tempoText": "string (optional)",
    "notes": "string (optional)"
  }]
}
```

---

## Admin – Programas Personales

> Requiere `SUPERADMIN`. Prefijo: `/api/v1/admin`

### POST `/admin/programs/generate`
Genera un programa personal para un atleta desde una plantilla.

**Body:**
```json
{
  "athleteProfileId": "string",
  "templateCode": "string (default: JUMP-MANUAL-14D)",
  "startDate": "YYYY-MM-DD",
  "phase": "OFF_SEASON | PRE_SEASON | IN_SEASON | POST_SEASON (optional)",
  "includePreparationPhase": "boolean (default: true)",
  "notes": "string (optional)"
}
```

### PATCH `/admin/programs/:programId/sessions/:sessionId`
Actualiza título, fecha, estado o notas de una sesión.

---

## Catálogo (público)

### GET `/api/v1/catalog/exercises`
Lista pública de ejercicios con instrucciones y media.

---

## Plantillas (público)

### GET `/api/v1/templates/program-templates`
Lista todas las plantillas de programa (id, code, name, description, cycleLengthDays).

### GET `/api/v1/templates/program-templates/:code`
Detalle completo de una plantilla con días y prescripciones.

---

## Bootstrap

### GET `/api/v1/bootstrap/program-template`
Devuelve la plantilla de programa embebida (bootstrap/seed data).

---

## Health

### GET `/api/v1/health`
Health check.

**Respuesta 200:**
```json
{
  "status": "ok",
  "service": "3m30cm-api",
  "version": "string",
  "timestamp": "ISO 8601"
}
```

---

## Variables de entorno (API)

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | development / test / production | development |
| `PORT` | Puerto del servidor | 4100 |
| `DATABASE_URL` | URL de PostgreSQL (requerido) | — |
| `WEB_URL` | URL del frontend (CORS) | http://localhost:4173 |
| `SMTP_HOST` | Host SMTP para login/forgot-password | — |
| `SMTP_PORT` | Puerto SMTP | 587 |
| `SMTP_SECURE` | Usa SMTPS directo (`true`) o STARTTLS (`false`) | false |
| `SMTP_TLS_SERVERNAME` | Hostname del certificado TLS cuando `SMTP_HOST` es alias/CNAME | — |
| `SMTP_USER` | Usuario SMTP | — |
| `SMTP_PASS` | Password SMTP | — |
| `SMTP_FROM` | Remitente usado en correos transaccionales | noreply@3m30cm.supernovatel.com |
| `MINIO_ENDPOINT` | Endpoint de MinIO/S3 | http://localhost:9000 |
| `MINIO_PUBLIC_BASE_URL` | URL pública para assets | http://localhost:9000 |
| `MINIO_BUCKET` | Bucket para media | jump-assets |
| `MINIO_REGION` | Región reportada al cliente S3 | us-east-1 |
| `MINIO_ACCESS_KEY_ID` | Access key de MinIO | minioadmin |
| `MINIO_SECRET_ACCESS_KEY` | Secret key de MinIO | minioadmin |
| `MINIO_FORCE_PATH_STYLE` | Fuerza path-style para MinIO/S3 compatible | true |
| `JWT_ACCESS_SECRET` | Secreto para firmar JWT (min 16 chars) | change-me-super-secret |
| `JWT_ACCESS_EXPIRES_IN` | Expiración del token | 7d |
| `APP_VERSION` | Versión de la API | dev |
| `RUN_SEED_ON_DEPLOY` | Flag operativa para ejecutar seed desde deploy.sh | 0 |

Notas:

- En producción `WEB_URL` debe ser `https://3m30cm.supernovatel.com`.
- Si el SMTP presenta un certificado para otro dominio distinto de `SMTP_HOST`, define `SMTP_TLS_SERVERNAME` con el hostname real que aparece en el certificado.
- `MINIO_PUBLIC_BASE_URL` debe ser la base pública del host, sin incluir el bucket, porque la API construye la URL final como `base/bucket/objectKey`.
- La web admin usa `/api/*` relativo por defecto; `VITE_API_BASE_URL` es un override opcional del frontend y no un requisito del backend.

### Nota operativa

La infraestructura completa del proyecto, el flujo Docker local, el deploy con `deploy.sh` y la separacion `dev`/`prod` de las apps Expo estan documentados en `supernovatel.md`.

Como contexto rapido:

- local: la API y la web corren en Docker; Expo corre fuera de Docker
- produccion: `deploy.sh` construye, hace push y luego ejecuta `pull + api-migrate + up -d` por SSH
- mobile/mobile2: `run dev` apunta a local y `run prod` apunta al backend publico

---

## Enums

### Role
`ATHLETE` | `COACH` | `TEAM_ADMIN` | `SUPERADMIN`

### SessionStatus
`PLANNED` | `COMPLETED` | `SKIPPED`

### SeasonPhase
`OFF_SEASON` | `PRE_SEASON` | `IN_SEASON` | `POST_SEASON`

### DayType
`TRAINING` | `REST` | `ACTIVE_RECOVERY` | `TESTING` | `SPORT`

### SeriesProtocol
`NONE` | `FIXED` | `PYRAMID` | `DROP` | `WAVE` | `BY_FEEL`

### MediaKind
`IMAGE` | `GIF` | `VIDEO`

---

## Mejoras futuras sugeridas

- [ ] Paginación en endpoints de listado (athletes, sessions, exercises)
- [ ] Filtros de búsqueda en catálogo de ejercicios (por categoría, equipamiento)
- [ ] Endpoint de estadísticas de atleta (progresión, carga acumulada)
- [ ] Webhook/notificaciones push cuando coach asigna nuevo programa
- [ ] Endpoint de exportación de programa a PDF/calendario
- [ ] Rate limiting en endpoints públicos
- [ ] Refresh tokens (actualmente solo access token con 7d TTL)
- [ ] Versionado de API (v2 con breaking changes)
- [ ] Endpoint de media bulk upload para múltiples ejercicios
- [ ] Endpoint de duplicación de plantillas de programa
- [ ] Soporte multi-idioma en instrucciones de ejercicios (ya existe campo `locale`)
- [ ] Endpoint de comparación entre sesiones (atleta vs programa ideal)
