# Bitácora del Proyecto 3m30cm

## Resumen del Proyecto

**3m30cm-platform** es un monorepo (npm workspaces) para una plataforma de entrenamiento de salto vertical. Contiene:

- **apps/api** – API REST con Express, Prisma y PostgreSQL
- **apps/web** – Panel web (Vite + React 19)
- **apps/mobile** – App móvil principal (Expo SDK 54 + React Native 0.81)
- **apps/mobile2** – Variante gamificada de la app móvil (Expo SDK 54)

---

## Registro de trabajo

### 16. Welcome video upload UI, populate-gifs endpoint, media downloader, bug fixes (2026-05-19)

**Objetivos:**
1. Completar UI de upload de video de bienvenida en web admin + selector de apps.
2. Crear endpoint `POST /api/v1/admin/exercises/populate-gifs` para descargar GIFs de ExerciseDB y guardarlos en MinIO.
3. Crear script standalone `populate-exercise-gifs.ts` para correr manualmente con `npm run populate:gifs`.
4. Agregar botón "Obtener media" en el catálogo de ejercicios del web admin.
5. Corregir bugs encontrados en sesiones previas: URL input rechazando rutas relativas, Apps view con paneles no seleccionables, mobile video URL con ERR_ACCESS_DENIED.

**Bugs corregidos:**

1. **Welcome video URL input** (`apps/web/src/App.tsx` ~line 7250)
   - Cambio: `type="url"` → `type="text"` (porque admitimos rutas relativas `/api/v1/assets/...`).
   - Placeholder ahora clarifica formato: `/api/v1/assets/... o https://...`.

2. **Apps view panels no seleccionables** (`apps/web/src/App.tsx` ~line 3762)
   - Raíz: `Promise.all()` fallaba silenciosamente cuando uno de los fetches fallaba.
   - Solución: Cambio a try/catch individual para cada fetch (app-configs, available-apps).
   - Resultado: Ambos paneles ahora renderean con su contenido correspondiente.

3. **"Asociar app" form siempre muestra opciones** (`apps/web/src/App.tsx` ~line 11332)
   - Raíz: Sin `availableApps` no había forma visible de crear una nueva app config.
   - Solución: Formulario de alta siempre visible con:
     - Si `availableApps.length > 0`: selector de directorio (auto-llena slug/displayName).
     - Si `availableApps.length === 0`: inputs de texto para slug/displayName.
     - Siempre: selector de template.
   - Post-submit: Refresh independiente de ambos listados (try/catch por separado).

4. **Mobile welcome video `net::ERR_ACCESS_DENIED`**
   - Raíz: URLs relativas `/api/v1/assets/...` se interpretaban como rutas de archivo local en el WebView.
   - Solución: Implementación de `rewriteLocalAssetUrl` en `apps/mobile2/components/runtimeConfig.ts`.
     - Prepend `apiBaseUrl` a rutas relativas que empiezan con `/api/v1/assets/`.
     - URLs absolutas (http/https) pasan intactas.

5. **Welcome video auto-play solo para nuevos usuarios**
   - Raíz: Modal de video mostraba cada vez que se ejecutaba `useEffect` de templates.
   - Solución: Flag `welcomeVideoSeenStorageKey` en AsyncStorage (persiste entre sesiones).
   - Lógica: Si `!seen && welcomeVideoUrl` en arranque, muestra modal; botón "Continuar" marca visto.
   - "Ver video del programa" en pantalla Hoy siempre disponible si `hasProgram && welcomeVideoUrl`.

**Cambios aplicados:**

1. **API: nuevo endpoint `POST /api/v1/admin/exercises/populate-gifs`** (`apps/api/src/routes/admin-exercises.ts`)
   - SUPERADMIN required.
   - Validación: `X_RAPIDAPI_KEY` en `.env` (retorna 400 si falta).
   - Flujo:
     1. Fetch todos los ejercicios: `id`, `slug`, `name`.
     2. Para cada uno (300ms delay): `searchExerciseDb(name)` → download GIF → `uploadExerciseMedia()` → upsert `ExerciseMediaAsset` (primary GIF).
     3. Retorna `{ ok: number; skipped: number; errors: number; results: PopulateGifsResult[] }`.
   - Helper `searchExerciseDb(name)`: Fetch a ExerciseDB RapidAPI con X_RAPIDAPI_KEY/HOST, retorna URL del GIF del primer match.

2. **API: nuevo script `populate-exercise-gifs.ts`** (`apps/api/src/scripts/populate-exercise-gifs.ts`)
   - Ejecutable: `npm run populate:gifs` (desde `apps/api`).
   - Independiente del server; carga `.env` con dotenv.
   - Reutiliza: `S3Client`, `searchExerciseDb()`, `uploadExerciseMedia()`, Prisma.
   - 600ms de delay entre ejercicios (rate limit).
   - Reporta: ok/skipped/errors al final.

3. **API: package.json script** (`apps/api/package.json`)
   - Nuevo: `"populate:gifs": "tsx src/scripts/populate-exercise-gifs.ts"`.

4. **Web admin: estados + handler + button** (`apps/web/src/App.tsx`)
   - Estados: `populatingGifs: boolean`, `populateGifsResult: { ok, skipped, errors, results[] }`.
   - Handler `handlePopulateGifs()`: POST a `/api/v1/admin/exercises/populate-gifs`, setea resultado.
   - Botón "Obtener media" en header de ejercicios (junto a "Nuevo"):
     - Disabled mientras `populatingGifs === true`.
     - Label cambia a "Obteniendo…" durante ejecución.
     - Tooltip: "Descarga GIFs desde ExerciseDB y los sube a MinIO para cada ejercicio del catálogo".
   - Panel expandible `<details>` debajo del header:
     - Summary: `✅ N ok · ⏭️ N omitidos · ❌ N errores`.
     - Lista: Cada ejercicio con nombre, nombre matched de ExerciseDB, status icon, y mensaje de error si aplica.

5. **Welcome video fixes en App.tsx**
   - Lineas ~4704 y ~7309: Agregan `setWelcomeVideoFile(null)` al resetear template (evita que persista archivo anterior).

**Validación:**
- TypeScript: `npx tsc --noEmit` en `apps/api` y `apps/web` ✓
- Todos los cambios compilables, sin errores.

---

### 15. Apps view en web admin, welcomeVideoUrl en templates, auto-selección de template en mobile2 (2026-05-18)

**Objetivos:**
1. Sección "Apps" en el panel web admin para asociar slugs de apps móviles a un `ProgramTemplate`.
2. Campo `welcomeVideoUrl` en `ProgramTemplate` para enlazar un video de bienvenida.
3. `apps/mobile2` auto-selecciona su template asignado al arranque (sin selector manual).
4. `apps/mobile2` muestra el video de bienvenida antes del onboarding (solo la primera vez) y un botón "Ver video del programa" en la pantalla Hoy.

**Cambios aplicados:**

1. **Schema Prisma** (`apps/api/prisma/schema.prisma`)
   - Nuevo campo `welcomeVideoUrl String?` en `ProgramTemplate` (después de `techniqueDescription`).
   - Nuevo modelo `MobileAppConfig` con `id`, `appSlug` (unique), `displayName`, `templateCode`, `createdAt`, `updatedAt`.
   - No hay FK de `MobileAppConfig` a `ProgramTemplate` (referencia flexible por string `templateCode`).

2. **Migración** (`apps/api/prisma/migrations/20260518_add_welcome_video_and_app_config/migration.sql`)
   - `ALTER TABLE "ProgramTemplate" ADD COLUMN "welcomeVideoUrl" TEXT;`
   - `CREATE TABLE "MobileAppConfig"` con índice unique en `appSlug`.

3. **API: admin-templates.ts**
   - `updateTemplateSchema` acepta `welcomeVideoUrl: z.string().url().nullable().optional()`.
   - Handler `PUT /program-templates/:code` propaga `welcomeVideoUrl` al update de Prisma.

4. **API: templates.ts**
   - `GET /program-templates` select incluye `welcomeVideoUrl: true`.
   - `GET /program-templates/:code` ya devolvía todos los escalares; sin cambio adicional necesario.

5. **API: nuevo archivo `app-config.ts`**
   - Router público `appConfigRouter`: `GET /app-config/:appSlug` → devuelve `{ templateCode, welcomeVideoUrl }` para que la app se auto-configure sin auth.
   - Router admin `adminAppConfigRouter` (SUPERADMIN):
     - `GET /admin/app-configs` → lista todos los `MobileAppConfig`.
     - `PUT /admin/app-configs/:appSlug` → upsert con `{ displayName, templateCode }`.

6. **API: index.ts / admin.ts**
   - `appConfigRouter` montado en `/api/v1/app-config`.
   - `adminAppConfigRouter` montado en `/api/v1/admin`.

7. **Web admin** (`apps/web/src/App.tsx`)
   - Nuevo tipo `AdminView = "... | "apps"`.
   - Nueva interfaz `AppConfigRecord`.
   - `ProgramTemplateMeta` e `TemplateFormState` incluyen `welcomeVideoUrl`.
   - `emptyTemplateForm()` inicializa `welcomeVideoUrl: ""`.
   - `handleTemplateSubmit` envía `welcomeVideoUrl` al PUT.
   - Nuevo estado `appConfigs` + `appConfigDraft` + `handleSaveAppConfig`.
   - useEffect carga app-configs cuando `adminView === "apps"`.
   - Formulario de metadatos de template incluye campo "Video de bienvenida (URL)".
   - Sidebar: botón "📱 Apps" después de Nutrición.
   - Nueva sección JSX "Apps": lista de configs existentes con selector de template y botón Guardar; formulario de alta de nueva app (slug + display name + template).

8. **mobile2: `apps/mobile2/app/index.tsx`**
   - `import { WebView }` de `react-native-webview` (ya instalado v13.15.0).
   - Constantes `welcomeVideoSeenStorageKey = "wv_seen_v1"` y `MOBILE_APP_SLUG = "3m30cm-game"`.
   - Estado `welcomeVideoUrl` y `showWelcomeVideo`.
   - useEffect de templates ampliado: además de cargar la lista pública, hace `fetch /api/v1/app-config/3m30cm-game` y si hay `templateCode` lo aplica a `athleteSetup`; si hay `welcomeVideoUrl` y no se ha visto antes, muestra el modal.
   - Modal de video de bienvenida (`<WebView>`) con botones "Saltar" (cierra sin marcar) y "Continuar" (marca visto en AsyncStorage y cierra).
   - Selector de templates eliminado del formulario de onboarding (la app ya recibe el template del servidor).
   - Props `welcomeVideoUrl` y `onShowWelcomeVideo` pasadas a `<HoyScreenV2>`.

9. **mobile2: `HoyScreenV2.tsx`**
   - Props `welcomeVideoUrl?: string | null` y `onShowWelcomeVideo?: () => void` añadidas a `HoyScreenV2Props`.
   - Botón "🎬 Ver video del programa" visible cuando `hasProgram && welcomeVideoUrl`.
   - Selector de templates eliminado del step 2 del onboarding (solo queda selector de fecha de inicio).

10. **mobile2: `NutricionScreen.tsx`**
    - Corregido `C.accent` → `C.teal` (la paleta no tiene `.accent`).

**Validación:**
- `npx prisma generate` (sin DB) ✓
- `npx tsc --noEmit` en `apps/api` ✓
- `npx tsc --noEmit` en `apps/web` ✓
- `npx tsc --noEmit` en `apps/mobile2` ✓
- Migración pendiente de aplicar contra DB: `cd apps/api && npx prisma migrate dev`

---

### 14. Fix cycleLengthDays, variantes de ejercicio por semana, reestructura UI /programas (2026-05-11)

**Problemas resueltos:**

1. **Bug cycleLengthDays** — Al crear un programa wizard de 21 días, el panel mostraba "ciclo de 21 días" aunque al agregar una segunda fase de 14 días el total debería ser 35 días. La raíz era que `cycleLengthDays` del `ProgramTemplate` solo se escribía una vez (durante la creación del wizard) y no se actualizaba al agregar/editar/eliminar fases.

2. **Segunda fase no conectada visualmente** — El editor de fases vivía dentro del mismo panel-card que el listado de programas (left panel), sin encabezado claro que indicara a qué programa pertenecían las fases. El usuario no podía distinguir el contexto.

3. **Nuevo feature: variantes de ejercicio por semana** — Cada `ExerciseTaskTemplate` puede tener variantes (`ExerciseTaskVariant`) que reemplazan la prescripción en una semana específica del bloque maestro (ej. semana 2: más series; semana 3: descarga). El ejercicio base se puede overridear o no.

**Cambios aplicados:**

1. **Schema Prisma** (`apps/api/prisma/schema.prisma`)
   - Nuevo modelo `ExerciseTaskVariant` con campos `exerciseTaskId`, `weekNumber` (1-52), `exerciseId?`, `name?`, `sets?`, `repsOrTimeText?`, `notes?`
   - Relación `variants ExerciseTaskVariant[]` agregada a `ExerciseTaskTemplate`
   - Relación `exerciseTaskVariants ExerciseTaskVariant[]` agregada a `Exercise`
   - Unique index `(exerciseTaskId, weekNumber)` para evitar duplicados por semana

2. **Migración** (`apps/api/prisma/migrations/20260511_add_exercise_task_variant/migration.sql`)
   - CREATE TABLE + índices + FK con CASCADE en `exerciseTaskId` y SET NULL en `exerciseId`

3. **API** (`apps/api/src/routes/admin-templates.ts`)
   - `loadWizardPhases` actualizado: incluye `variants { orderBy: weekNumber, include: exercise }` en tasks
   - Nueva función `syncTemplateCycleLengthFromPhases(db, programTemplateId)`: recalcula y persiste `cycleLengthDays` como suma de `durationDays` de todas las fases del template
   - Llamada a `syncTemplateCycleLengthFromPhases` insertada en cada handler de fase (POST, PUT, DELETE) dentro del transaction, antes de retornar las fases
   - Nuevas rutas de variantes:
     - `POST   /api/v1/admin/program-templates/:code/wizard/tasks/:taskId/variants` (upsert por weekNumber)
     - `PUT    /api/v1/admin/program-templates/:code/wizard/tasks/:taskId/variants/:variantId`
     - `DELETE /api/v1/admin/program-templates/:code/wizard/tasks/:taskId/variants/:variantId`
   - Ownership verificada via join `task → phaseDayTemplate → phaseTemplate → programTemplateId`

4. **Frontend** (`apps/web/src/App.tsx`)
   - Nuevo tipo `ExerciseTaskVariantRecord` y `ProgramPhaseTaskRecord` actualizado con `variants: ExerciseTaskVariantRecord[]`
   - `applyLoadedTemplate` ahora sincroniza `cycleLengthDays` en `allTemplates` al cargar fases (suma de `durationDays`)
   - Nuevos estados: `activeTemplateTab ("phases"|"technique")`, `selectedTaskId`, `variantForm`
   - Nuevos handlers: `handleVariantSave(taskId)`, `handleVariantDelete(taskId, variantId)`
   - **Reestructura completa de la sección /programas**:
     - **Panel izquierdo**: Solo lista de programas con badge "Wizard · N fase(s)" o "Legacy", duración total, botón "Abrir", "Editar metadatos", "Eliminar". Todos los modales (type chooser, legacy form, wizard form) movidos aquí.
     - **Panel derecho**: Cuando hay programa seleccionado → encabezado con nombre/código/duración total + tabs [Fases | Técnica]. Cuando nada seleccionado → Exclusiones por atleta (sin cambios).
     - **Tab Fases**: Lista de fases numeradas (con semanas y conteo de tasks), expandible al hacer click → muestra días con lista de tasks. Cada task es clickeable para abrir su editor de variantes inline.
     - **Tab Técnica**: Editor de técnica completo (funcionalidad sin cambios, solo reubicado).

**Validación:**
- `npm --prefix apps/api run prisma:generate` ✓
- `npm --prefix apps/api run build` ✓
- `npm --prefix apps/web run build` ✓


- **packages/shared** – Tipos y utilidades compartidas

---

## Registro de trabajo

### 13. Backend inicial del Athlete Performance Wizard + técnicas por programa preservadas (2026-05-11)

**Objetivo cerrado en este slice:**
- arrancar el refactor del Program Creator hacia una jerarquía `Programa -> Fase -> Calendario Diario -> Bloques de Ejercicio`
- mantener compatibilidad dual con el modelo legacy de 14 días
- dejar explícito que las técnicas, la bio-referencia y las mediciones siguen asociadas al `ProgramTemplate`, no a cada fase

**Cambios aplicados:**

1. **Nuevo modelo faseado en Prisma**
  - agregados `ProgramPhaseTemplate`, `ProgramPhaseDayTemplate` y `ExerciseTaskTemplate`
  - nuevos enums `ExerciseEvolution` y `ExerciseZone`
  - las fases cuelgan del `ProgramTemplate`, conviviendo con `ProgramDayTemplate`

2. **Parser tolerante de bloque maestro CSV/texto**
  - nuevo helper `apps/api/src/lib/exercise-task-import.ts`
  - soporta aliases de columnas como `Día`, `Nombre`, `Series`, `Reps/Tiempo`, `Peso(Y/N)`, `Unilateral(Y/N)`, `Evolución`, `Zona`, `VideoURL`
  - devuelve filas normalizadas, issues por fila y warnings por columnas desconocidas

3. **Endpoints iniciales del wizard**
  - `POST /api/v1/admin/program-templates/:code/wizard/exercise-tasks/parse`
  - `POST /api/v1/admin/program-templates/:code/wizard/phases/import`
  - el segundo endpoint ya persiste una fase y sus días/tasks desde el bloque importado

4. **Lectura pública del template extendida**
  - `GET /api/v1/templates/program-templates/:code` ahora puede devolver tanto la vista legacy (`days`) como la nueva vista faseada (`phases`)
  - `techniques` se mantiene en el mismo template, preservando su uso para bio-referencia, evolución e historial del atleta a lo largo de todo el programa

5. **Alineación de producto**
  - `apps/mobile2` queda tratada como la app oficial
  - `apps/mobile` pasa a considerarse superficie legacy y deja de ser el foco de trabajo del proyecto

**Validación ejecutada:**
- `npm --prefix apps/api run prisma:generate`
- `npm --prefix apps/api run build`

### 12. UX: técnica inline al cerrar sesión, voz del timer sin lag, salto máximo tappable (2026-05-09)

**Problemas corregidos:**

1. **Cierre de sesión sin selector de técnica visible (bloqueante)**
   - El modal de técnica se mostraba *después* de tocar "Guardar sesión", con un error si no había técnica elegida.
   - Ahora el selector de técnica está **inline dentro del formulario de cierre** (`EjerciciosScreen`), justo después del campo de altura de salto.
   - Las opciones se muestran como chips seleccionables (una por cada técnica con medición configurada).
   - El estado `selectedJumpTechniqueId` se maneja en `mobile2/app/index.tsx` y se pasa a `EjerciciosScreen` como prop.
   - Se eliminó el modal de vinculación de técnica post-guardado por completo.
   - Se resetea `selectedJumpTechniqueId` al cargar una sesión nueva o luego de guardar.

2. **Voces del temporizador con latencia (3,2,1 llegaba tarde)**
   - Se reemplazó `Speech.stop(); Speech.speak(...)` en cada tick por un warm-up del motor al montar el componente.
   - Al iniciar `ExerciseTimer`, se habla una frase silenciosa ("listo") para despertar el motor TTS.
   - El `speak()` ahora sólo llama a `Speech.speak()` sin parar antes, lo que elimina el reset que causaba latencia.
   - La bandera `speechReadyRef` asegura que no se intenta hablar antes de que el motor esté listo.

3. **Salto máximo en Hoy sin attributción de técnica**
   - La tarjeta "Salto máximo" en `HoyScreenV2` ahora es un `Pressable` con texto "Toca para ver con qué técnica fue".
   - Al tocarla se abre un modal que muestra el valor y, si se encuentra, la(s) técnica(s) cuyas métricas coincidan con ese valor máximo.
   - La derivación se hace en `index.tsx` con el memo `bestJumpTechniqueTitles` (busca técnicas con métricas en cm que coincidan con `personalBests.jumpHeightCm` ±0.05).
   - Se pasa como prop `bestJumpTechniqueTitles: string[]` a `HoyScreenV2`.

**Archivos modificados:**
- `apps/mobile2/app/index.tsx`
- `apps/mobile/components/screens/EjerciciosScreen.tsx`
- `apps/mobile2/components/screens/HoyScreenV2.tsx`

### 11. mobile2: medición de salto obligatoria por técnica al cerrar sesión (2026-05-07)

**Problema detectado:**
- Al cerrar sesión era posible guardar `jumpHeightCm` sin elegir técnica.
- Eso generaba desalineación: aparecía en Evolución (progreso global) pero no en Técnica (historial por técnica).

**Corrección aplicada (`apps/mobile2/app/index.tsx`):**
- El vínculo de medición con técnica ahora es **obligatorio** si hay altura de salto cargada.
- Se eliminó el bypass de modal:
  - ya no existe botón "No vincular"
  - el `onRequestClose` del modal ya no confirma con `null`
- Se agregó validación defensiva en `doSubmitLog()` para bloquear submit si hay salto y no hay técnica seleccionada.
- Si no hay técnicas con definiciones de medición, se muestra error y no se permite guardar esa medición.
- El guardado del metric en `/api/v1/athlete/technique/metrics` dejó de ser "non-blocking" silencioso: ahora cualquier fallo sube por el flujo de error.

**Resultado esperado:**
- Si existe medición de salto, siempre queda asociada a una técnica.
- Se evita que una medición quede solo en progreso global sin reflejarse en Técnica.

### 10. mobile2: ajuste final de Técnica + correcciones de encoding + origen de métricas (2026-05-07)

Commit: `c7f7547`

**Cambios funcionales cerrados:**

1. **Acordeón real en Técnica (contenido inline por técnica)**
  - La pantalla muestra primero solo el listado de técnicas.
  - Al tocar una técnica, se expande su bloque dentro del mismo item.
  - Al volver a tocar la misma técnica, se contrae.

2. **Orden visual en técnica seleccionada**
  - Dentro del item expandido se prioriza: **video principal** primero y luego descripción.
  - Recursos no-video (imagen/GIF) quedan después del bloque descriptivo.

3. **Comparativas/Historial con texto corregido**
  - Se corrigieron textos con caracteres rotos (acentos y símbolos) en secciones de comparativas, historial y visor de correcciones.

4. **Historial con distintivo de origen de medición**
  - `📝 Sesión` para métricas vinculadas desde cierre de sesión.
  - `📊 App` para métricas originadas por análisis/registro de la app.
  - Se mantiene badge `Base` para baseline.

5. **Validación técnica**
  - `npx tsc --noEmit` ejecutado sin errores tras los cambios.

**Archivo principal modificado:**
- `apps/mobile2/components/screens/TecnicaScreen.tsx`

### 9. mobile2: 5 mejoras UI/UX — racha SVG, check-in adaptativo, técnica accordion, métricas vinculadas, gráficos (2026-05-08)

**Mejoras implementadas:**

1. **ProgressRing SVG (HoyScreenV2.tsx)**
   - Causa raíz del bug: el enfoque de dos mitades con `transformOrigin` CSS no es soportado por React Native.
   - Solución: reescritura del ProgressRing usando `react-native-svg` (SVG `strokeDashoffset`).
   - El arco arranca siempre en las 12 en punto (rotate -90°), animado con `Animated.Value`.
   - Paquetes agregados: `react-native-svg`.

2. **Check-in adaptativo (index.tsx)**
   - `saveTodayCheckIn()` ahora persiste `savedCoachingStatus` (push/protect/focus/steady).
   - Banner de coaching mostrado por encima de la lista de ejercicios según estado.
   - `coachingChip` dentro de cada tarjeta de ejercicio con recomendación de series/descanso.

3. **Técnica accordion + checklist + cámara con filtro de calidad (TecnicaScreen.tsx)**
   - Eliminado heroCard "Técnicas del programa".
   - Lista plana de técnicas convertida a acordeón (expandedTechniqueId state).
   - Eliminado sectionCard "Biomecánica automática" (muy técnico para atletas).
   - "Seguimiento técnico" reemplazado por emoji checklist de 5 requisitos requeridos + 1 opcional.
   - Botones cambiados a "Elegir de galería" / "Grabar ahora con cámara".
   - Modal de cámara con guard de calidad en tiempo real: detección de iluminación (base64 length) y movimiento de cámara (varianza entre frames). Botón de grabación bloqueado si alguna condición falla.
   - Paquetes agregados: `expo-camera`.

4. **Métricas vinculadas al log de sesión (index.tsx)**
   - `handleSubmitLog` intercepta si hay `jumpHeightCm` + técnicas con `measurementDefinitions`.
   - Modal de vínculo técnico: permite asociar la altura registrada a una técnica.
   - `doSubmitLog()` hace segunda llamada a `POST /api/v1/athlete/technique/metrics` si se elige técnica.
   - La medición queda en `athlete_technique_metric` vinculada a la sesión.

5. **Gráficos SVG en Comparativas e Historial (TecnicaScreen.tsx)**
   - Nuevo componente `MetricLineChart` usando `react-native-svg` (Polyline + Circle + axes + baseline dashed line).
   - Insertado al inicio de los sectionCards Comparativas e Historial.
   - Comparativas y Historial ahora muestran evolución visual de métricas.

**Archivos modificados:**
- `apps/mobile2/components/screens/HoyScreenV2.tsx`
- `apps/mobile2/app/index.tsx`
- `apps/mobile2/components/screens/TecnicaScreen.tsx`



**Problemas reportados:**
- En cámara lenta se detectaban eventos, pero en videos a velocidad normal faltaban eventos.
- El modal de anotación del aro mostraba fondo gris (sin frame del video), imposible anotar.

**Fix aplicado:**
- `TechniqueVideoPoseAnalyzer.tsx`: muestreo adaptativo para clips cortos.
	- Si `durationMs <= 2600`, usar al menos `30 fps` y `maxFrames >= 480`.
	- Objetivo: evitar pérdida de fases rápidas (contactos/APEX) en videos normales.
- `TecnicaScreen.tsx`: el modal de aro ahora renderiza preview del video del atleta congelado cerca de APEX.
	- Se posiciona el preview en `rimPreviewTimestampMs - 120ms`.
	- El `frameIndex` guardado de la anotación ahora usa el frame de preview (APEX/fallback), no `0` fijo.
	- Coordenadas de toque normalizadas (`0..1`) respecto al área de anotación.

**Archivos modificados:**
- `apps/mobile2/components/technique/TechniqueVideoPoseAnalyzer.tsx`
- `apps/mobile2/components/screens/TecnicaScreen.tsx`

---

### 7. Follow-up mobile2: esperar frame decodificado en WebView Android (2026-05-07)

**Problema:** seguía apareciendo `MediaPipe no pudo procesar el frame del video del atleta` aun después del cambio a canvas.

**Hipótesis aplicada:** en Android WebView el evento `seeked` puede disparar antes de que el frame quede realmente decodificado para `drawImage()` / `pose.send()`.

**Fix:**
- agregar `waitForVideoFrame(video)` luego de cada `seek`
- si existe `requestVideoFrameCallback`, esperar ese callback
- si no, esperar `loadeddata` / `canplay` y un `requestAnimationFrame`
- ampliar el mensaje de error con `readyState`, dimensiones del video/canvas y detalle interno

**Archivo modificado:** `apps/mobile2/components/technique/TechniqueVideoPoseAnalyzer.tsx`

---

### 6. Fix mobile2: canvas para MediaPipe Pose en WebView (2026-05-07)

Commit: `ca92273`

**Problema:** Error "MediaPipe no pudo procesar el frame del video del atleta" al cargar un video en la app.

**Causa:** MediaPipe Pose espera un canvas o imagen como entrada (`.send({ image: canvas })`), pero el código pasaba un video element directamente.

**Fix:**
- Canvas oculto agregado al HTML del WebView (`<canvas id="pose-canvas" style="display:none;"></canvas>`)
- En `loadVideoUri`: obtener contexto 2D del canvas y devolverlo junto con el video
- Al procesar cada frame: dibujarlo en el canvas con `ctx.drawImage(video, ...)` antes de enviarlo a MediaPipe
- Canvas pasado a `pose.send()` en lugar del video element

**Archivo modificado:** `apps/mobile2/components/technique/TechniqueVideoPoseAnalyzer.tsx`

---

### 5. Fix mobile2: keep-awake, FPS 15, modal del aro, preload MediaPipe (2026-05-06)

Commit: `4dedada`

**Problemas resueltos:**

| Problema | Causa | Fix |
|---|---|---|
| Pantalla se apaga y WebView pausa (queda en frame 120 para siempre) | Sin keep-awake durante extracción | `activateKeepAwakeAsync("pose-analysis")` en `useEffect` tied a `analysisBusy` |
| Eventos detectados completamente distintos al web admin | mobile2 usaba 30fps/480 frames; algoritmo calibrado para **15fps** (`contactRunMinLength`, `minJumpFrames`, `smoothSeries radius` dependen del fps) | Cambiar defaults: `targetFps = 15`, `maxFrames = 240` |
| Modal "anotar el aro" nunca aparecía | Condición era `biomechanicsConfig?.rimAnnotation` (solo si admin configuró referencia) | Cambiar a `biomechanicsConfig` (siempre que haya contrato biomecánico) |
| "Preparando extracción..." tardaba mucho | MediaPipe descarga desde CDN solo cuando llega el primer request | Pre-cargar MediaPipe al montar el WebView, enviar `ready` recién cuando carga; montar WebView tan pronto como existe `biomechanicsConfig` |

**Archivos modificados:**
- `apps/mobile2/components/technique/TechniqueVideoPoseAnalyzer.tsx`: defaults 15fps/240, HTML pre-carga MediaPipe antes de enviar `ready`
- `apps/mobile2/components/screens/TecnicaScreen.tsx`: keep-awake, WebView siempre montado con biomechanicsConfig, condición del modal corregida, mensaje de status mejorado

---

### 4. APK build v2.1.4 (2026-05-06) — análisis biomecánico del atleta

**Build exitoso**: `BUILD SUCCESSFUL in 13m 35s` (Gradle 8.14.3, 722 tasks: 416 ejecutadas, 278 de caché)

APK generado: `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk` (96.3 MB)

Incluye la feature completa de análisis biomecánico del atleta (commit `5e349ce`): modal de anotación del aro, endpoint de atleta en API, tarjeta de resultados con métodos CoM/FT/Rim.

**Configuración del build:**
- SDK compileSdk/targetSdk: 36, minSdk: 24
- Kotlin: 2.1.20, Expo SDK 54, Metro: 1153 módulos
- Prebuild completo (fingerprint cambió `60dcf5ddcbe68eb3 → 7df516e48b40e8bc`)

---

### 3. Análisis biomecánico del atleta en mobile2 con anotación del aro y comparación vs referencia

Commit: `5e349ce`

Implementación completa del flujo de análisis en `apps/mobile2` que permite al atleta subir su propio video, extraer pose con MediaPipe, anotar el aro de su cancha y obtener RIM_REFERENCE + consenso desde el servidor.

#### Cambios por archivo

**`apps/mobile2/components/technique/athleteTechniqueAnalysis.ts`**
- `AthleteRimAnnotation` — nueva interfaz (frameIndex, xLeft, yLeft, xRight, yRight, annotatedAt)
- `ServerBiomechanicsResult` — nueva interfaz con `masterReference.jumpHeight.methods/consensusValueCm/status`
- `callBiomechanicsAnalyze()` — función async que llama al nuevo endpoint de atleta con landmarks + rimAnnotation + config
- `MobileTechniqueBiomechanicsConfig` ahora tiene `rimAnnotation?` y `masterReference?` para persistir referencia del admin

**`apps/mobile2/components/screens/TecnicaScreen.tsx`**
- Props nuevas: `accessToken?: string | null`, `apiBaseUrl?: string | null`
- Estado nuevo: `pendingLandmarks`, `showRimAnnotation`, `rimAnnotation`, `rimPoint1`, `rimPoint2`, `serverAnalyzing`, `serverResult`, `serverError`
- `handlePoseAnalysisResult()` — modificado para abrir modal de anotación del aro tras extracción si la técnica tiene rimAnnotation de referencia
- `runServerAnalysis()` — nueva función async que llama a `callBiomechanicsAnalyze()` y guarda resultado en `serverResult`
- `handleConfirmRimAnnotation()` / `handleSkipRimAnnotation()` — flujo del modal de anotación
- Modal de anotación del aro: 2 taps para marcar bordes del aro, con dots visuales y botón "Confirmar aro" / "Saltear"
- Card de resultados del servidor: badges por método (CoM/FT/Rim), consenso, vs referencia (delta en cm + %)
- Estilos nuevos: `serverResultCard`, `jumpMethodBadge*`, `consensusRow`, `vsReference*`, `rimModal*`, `rimDot`

**`apps/mobile2/app/index.tsx`**
- Pasa `accessToken` y `apiBaseUrl` al `<TecnicaScreen />`

**`apps/api/src/routes/athlete.ts`**
- Import de `analyze as analyzeBiomechanics` y `CalibrationError` desde `jumpHeightAnalyzer.js`
- Nuevo endpoint: `POST /api/v1/athlete/program-templates/:code/techniques/:techniqueId/biomechanics/analyze`
  - Requiere solo `requireAuth` (no SUPERADMIN)
  - Valida con `athleteBiomechanicsAnalyzeBodySchema`
  - Llama al mismo `analyze()` del servidor
  - `persistResult: false` por defecto — no guarda en DB
  - Retorna `{ masterReference }`

**`apps/api/src/lib/jumpHeightAnalyzer.ts`**
- `AnalysisInput.rimAnnotation` cambiado a `RimAnnotation | null`
- `analyze()` ya no lanza `CalibrationError` por DIP faltante cuando `rimAnnotation === null`

**`apps/api/src/lib/biometricSpaceConverter.ts`**
- `BiometricSpaceConverter` constructor acepta `RimAnnotation | null`
- Si null: `normPerCmV = 0`, `normPerCmH = 0` — métodos dependientes retornan `LOW_CONFIDENCE` automáticamente
- `getProjectedRimAtFrame()` retorna ceros seguros cuando `rimAnnotation === null`

#### Flujo de la nueva feature

1. Atleta sube video → MediaPipe extrae landmarks
2. Si la técnica tiene `biomechanicsConfig.rimAnnotation` → se muestra modal de anotación del aro del atleta
3. Atleta toca 2 puntos en pantalla (borde izq y borde der del aro)
4. Se llama `POST /api/v1/athlete/program-templates/{code}/techniques/{id}/biomechanics/analyze`
5. El servidor calcula FLIGHT_TIME + CENTER_OF_MASS + RIM_REFERENCE (si hay anotación) y devuelve `masterReference`
6. En pantalla aparece card con badges por método, consenso en cm, y comparación vs referencia del admin

### 2. Refactor arquitectural: anotación manual del aro + BiometricSpaceConverter

Se realizó una refactorización mayor que desvincula a MediaPipe de cualquier responsabilidad de detectar el aro. MediaPipe queda como extractor puro de 33 puntos clave del cuerpo humano; la calibración métrica pasa al servidor usando anotación manual de dos clics sobre el aro.

#### Cambios por archivo

**`packages/shared/src/index.ts`**
- 6 interfaces nuevas: `RimAnnotation`, `BiomechanicsCalibration`, `BiomechanicsParabolaFrame`, `BiomechanicsJointAngles`, `BiomechanicsKinematics`, `BiomechanicsMasterReference` (schemaVersion 2)

**`apps/web/src/techniquePoseExtraction.ts`**
- Eliminada `detectRimCandidate()` (~130 líneas de detección de píxeles naranjas)
- Eliminada `buildRimReference()` y campo `rimCandidate` en `FrameAnalysis`
- `rimReference` queda como `@deprecated` para retrocompatibilidad; ya no se genera en nuevas extracciones
- Agregada interfaz `RimAnnotation` y campo `rimAnnotation?: RimAnnotation | null` en `TechniqueProLandmarks`

**`apps/api/src/lib/biometricSpaceConverter.ts`** _(nuevo)_
- Clase `BiometricSpaceConverter`: calibra escala real con NBA (305 cm altura, 45.72 cm diámetro interior)
- `toMetricY(y_norm)` → cm sobre suelo; `getProjectedRimAtFrame(fi)` → aro proyectado por cameraTracking
- `CalibrationError` si la anotación no es geométricamente válida

**`apps/api/src/lib/jumpHeightAnalyzer.ts`** _(nuevo)_
- `analyze(input): MasterReference` — 3 métodos: FLIGHT_TIME, CENTER_OF_MASS, RIM_REFERENCE
- CoM usa `converter.normPerCmV`; RIM usa `converter.getProjectedRimAtFrame(apex)`
- Kinematics: parábola CoM (TOE_OFF→LANDING) + ángulos articulares (rodilla/cadera) en DIP/despegue/apex

**`apps/api/src/routes/admin-templates.ts`**
- `rimAnnotationSchema` (Zod), campo en `techniqueProLandmarksSchema` y `techniqueBiomechanicsConfigSchema`
- Endpoint nuevo: `POST /admin/program-templates/:code/techniques/:techniqueId/biomechanics/analyze`
  - Valida payload → llama `analyzeBiomechanics()` → persiste `masterReference` → devuelve `{ masterReference }`
  - HTTP 422 `INVALID_CALIBRATION` si la anotación no tiene sentido geométrico

**`apps/web/src/components/RimAnnotationTool.tsx`** _(nuevo)_
- SVG interactivo 2 clics: borde izquierdo (tablero) → auto-avance → borde derecho (punta)
- Overlay skeleton + puntos amarillo/naranja + línea "45.72 cm"
- Preview calibración en tiempo real (`normPerCmV`, `normPerCmH`)

**`apps/web/src/App.tsx`**
- Estados: `rimAnnotation`, `masterReference`, `biomechanicsAnalyzing`
- `useEffect` sincroniza desde `biomechanicsConfig` al cambiar técnica
- Botón "⚡ Calcular Biorreferencia" → `POST /biomechanics/analyze`
- `RimAnnotationTool` y `JumpHeightDebugModal` reciben las nuevas props

**`apps/web/src/components/JumpHeightDebugModal.tsx`**
- 4º tab **"Cinemática"**: gráfico SVG parábola CoM + tabla ángulos articulares
- Overlay `RimOverlay` (puntos amarillos + línea "45.72 cm") en tabs CoM y RIM
- Barra de consenso muestra datos del servidor si `masterReference` disponible

**`apps/web/src/styles.css`**
- Bloque `.rat-*` para `RimAnnotationTool`
- `.jhdm-table thead` para tabla de ángulos en tab Cinemática

#### Razón del cambio
El sistema anterior producía CoM=538 cm y RIM=352 cm por usar detección de píxeles naranjas sin referencia métrica fija. Con anotación manual de dos puntos el servidor calibra con precisión usando las constantes oficiales de la NBA.

#### Validación
- `npx tsc --noEmit` pasa sin errores en `apps/api` y `apps/web`
- Branch: `bio`

---

### 0.1. Ajuste de muestreo para analisis tecnico en mobile2

Se ajustó el analizador de video del atleta en `apps/mobile2` para aumentar la resolución temporal del gesto:

- `TechniqueVideoPoseAnalyzer` pasó de `targetFps = 15` a `targetFps = 30`
- el tope `maxFrames` pasó de `240` a `480` para no recortar videos útiles por duplicar el muestreo
- la extracción sigue usando `@mediapipe/pose` dentro de `WebView`, igual que el stack de referencia del portal admin, pero ahora la app móvil conserva mejor contactos rápidos y transiciones cercanas al despegue/aterrizaje
- el portal web admin se deja momentáneamente en 15 fps porque el flujo profesional todavía se usa también con referencias en cámara lenta; esa revisión queda separada

Validación ejecutada durante este ajuste:

- `npm --prefix apps/mobile2 run build`
- `echo y | npm --prefix apps/mobile2 run apk:prod` (`BUILD SUCCESSFUL`, APK release regenerada con el muestreo a 30 fps)

### 0. Iteracion biomecanica visual en admin web

Se cerro una nueva iteracion del flujo biomecanico del portal admin web sobre `ProgramTemplateTechnique`:

- la referencia profesional sigue subiéndose desde `apps/web`, no desde mobile
- el backend valida y persiste `proVideoUrl`, `proLandmarks` y `biomechanicsConfig`
- `biomechanicsConfig` ya guarda `referenceMediaAssetId`, `referenceMotionProfile`, `focusPoints`, `pointChecks`, `angleChecks`, `trajectoryChecks`, `keyEvents`, `orientationPolicy` y `coachNotes`
- `keyEvents` ya admite `ANTEPENULTIMATE_CONTACT`, `PRE_PENULTIMATE_FLIGHT`, `APEX`, `source`, `confidence` y `detector` para soportar sugerencias automáticas sin perder override manual
- `angleChecks` ya puede anclarse a un evento concreto o a una ventana entre eventos, `pointChecks` agrega comparaciones por landmark y eje, y `trajectoryChecks` expresa recorridos biomecanicos como la cadera entre penúltimo apoyo y despegue
- los `keyEvents` ahora persisten `frameIndex` explicito ademas de `frameHint`
- el portal admin ya tiene un editor visual funcional con video sincronizado por frame, overlay SVG, scrubber, timeline con markers, creacion visual de puntos, alta visual de angulos y marcado visual de eventos
- los formularios inferiores del admin ahora exponen tambien anclajes por evento/ventana, point checks, trayectorias y politica de orientacion para dejar listo el contrato canónico atleta-vs-pro
- el bloque biomecanico ahora deja un guardado sticky visible dentro del editor para evitar perder cambios locales antes de persistir la técnica
- los formularios estructurados inferiores siguen presentes como respaldo de edicion fina, pero ahora tambien resaltan la seleccion activa en overlay y timeline
- el bloque visual se extrajo de `App.tsx` a componentes propios para reducir acoplamiento y facilitar iteraciones futuras

Validacion ejecutada durante esta iteracion:

- `npm --prefix apps/api run build`
- `npm --prefix apps/web run build`

### 1. Creación de mobile2 (apps/mobile2)

Se creó `apps/mobile2` como clon gamificado de `apps/mobile`. Archivos creados:

| Archivo | Descripción |
|---------|-------------|
| `app.json` | Config Expo: slug `3m30cm-game`, scheme `jump30cm-game`, tema oscuro |
| `package.json` | Dependencias idénticas a mobile, puerto 8082 |
| `metro.config.js` | Resolución de módulos compartidos con mobile vía alias `@mobile` |
| `tsconfig.json` | Herencia del tsconfig base |
| `babel.config.js` | Preset `babel-preset-expo` |
| `App.tsx` | Componente raíz con ExpoRoot (expo-router) |
| `app/_layout.tsx` | Layout raíz con Stack navigator y StatusBar |
| `app/index.tsx` | Pantalla principal (~3800 líneas), usa `HoyScreenV2` en lugar de `HoyScreen` |
| `components/screens/HoyScreenV2.tsx` | Pantalla "Hoy" gamificada |

Se añadieron scripts en el `package.json` raíz:
- `dev:mobile2` → arranca Metro en puerto 8082
- `dev:mobile2:web` → arranca versión web de mobile2

TypeScript verificado con 0 errores.

---

### 2. Fix: "Body is unusable" al iniciar Expo CLI

**Problema:** `TypeError: Body is unusable: Body has already been read` al ejecutar `expo start`.

**Causa:** Node.js v22.20.0 incluye undici como motor fetch nativo; su interacción con `getNativeModuleVersionsAsync` de Expo CLI causaba el crash.

**Solución:** Se agregó flag `--offline` a todos los scripts de `expo start` en mobile y mobile2.

---

### 3. Fix: Resolución de módulos para workspace compartido

**Problema:** "runtime not ready" – Metro no encontraba dependencias.

**Causa:** `extraNodeModules` en `metro.config.js` de mobile2 apuntaba a `apps/mobile/node_modules` para paquetes que npm había hoisted al `node_modules` raíz.

**Solución:** Se mapearon los paquetes correctamente:
- Paquetes hoisted → `workspaceRoot/node_modules` (expo, expo-av, expo-status-bar, etc.)
- Paquetes locales → `mobileRoot/node_modules` (react, react-native, expo-router, etc.)

Se fijaron puertos explícitos: mobile = 8081, mobile2 = 8082.

---

### 4. Fix: Duplicación de polyfills FormData

**Problema:** `ReferenceError: Property 'FormData' doesn't exist` en Hermes.

**Causa:** npm instaló copias duplicadas de `@react-native/*` en `mobile2/node_modules`. El polyfill de `@react-native/js-polyfills` se cargaba dos veces, causando conflictos en Hermes.

**Intentos de solución (iterativos):**

1. Mapear `@react-native/*` a las copias de mobile en `extraNodeModules` → parcial
2. Agregar `blockList` en metro.config.js para bloquear `mobile2/node_modules` → parcial
3. Custom `index.js` con `import` statements → Metro hoisted imports antes del guard
4. Custom `index.js` con `require()` → Metro reordenó los requires
5. Envolver require en arrow function → Bundle correcto pero error persistió
6. Remover expo-router, usar `expo/AppEntry` → mismo issue vía `Expo.fx`
7. Entry manual con `registerRootComponent` y FormData pre-inicializado → persistió

**Solución definitiva:** Se revirtió al mecanismo de arranque estándar de Expo:
- `package.json` main: `"expo-router/entry"` (idéntico a mobile)
- `App.tsx`: usa `ExpoRoot` con `require.context("./app")` (idéntico a mobile)
- Se removió `blockList` del `metro.config.js`
- Se conservó la configuración de `extraNodeModules` y alias `@mobile`

**Lección aprendida:** La cadena de boot de Expo (`expo-router/entry` → InitializeCore → polyfills → Expo.fx → App) maneja correctamente el orden de inicialización de polyfills. Cualquier entry point custom rompe esta cadena y causa el error de FormData en Hermes.

---

### 5. Creación de _layout.tsx para mobile2

Se creó `apps/mobile2/app/_layout.tsx` copiando el layout de mobile:
- `Stack` navigator sin header
- `StatusBar` estilo `light`
- Fondo `#0A1628`

---

### 6. Actualización de .gitignore

Se actualizó el `.gitignore` raíz para cubrir:
- Dependencias (`node_modules/`)
- Outputs de build (`dist/`, `web-build/`)
- Archivos Expo (`.expo/`, keystores, provisioning profiles)
- Web/Vite (`apps/web/dist/`)
- API (generated, dev.db)
- IDE/OS (`.vscode/`, `.DS_Store`, `Thumbs.db`)
- Logs y archivos temporales

---

### 7. Documentación

Se crearon:
- `bitacora.md` – Este archivo, registro de todo el trabajo realizado
- `api_reference.md` – Referencia de la API para futuras mejoras

---

## Configuración de puertos

| App | Puerto | Comando |
|-----|--------|---------|
| mobile | 8081 | `npm run dev:mobile` |
| mobile2 | 8082 | `npm run dev:mobile2` |
| web | 5173 (Vite default) | `npm run dev:web` |
| api | según .env | `npm run dev:api` |

## Notas técnicas

- **Node.js v22+** requiere `--offline` en Expo CLI por conflicto con undici/fetch
- **npm workspaces** hoistea la mayoría de paquetes al `node_modules` raíz
- **mobile2** comparte componentes de mobile vía alias `@mobile` en Metro
- **Metro config de mobile2** usa `extraNodeModules` para resolver desde mobile y workspace root

---

### 8. Rediseño de pantallas auth y footer "powered by"

Se rediseñaron las pantallas de login/registro en ambas apps con tema oscuro de juego:
- Fondo `#0A1628`, tokens de diseño (`C`, `R`, `S`) desde `apps/mobile/components/tokens.ts`
- Logo en la parte superior, pestañas amber (login/registro), formulario con inputs oscuros
- Botón primario amber, boton secundario outline
- Footer fijo "powered by [logo]" con opacidad 0.42 en todas las pantallas (auth + home + hoy/ejercicios/programa/evolución)

---

### 9. Fix: barra de navegación Android blanca

**Problema:** Debajo del footer custom aparecía la barra del sistema Android en blanco.

**Solución:**
- `app.json` de ambas apps: `"navigationBar": { "backgroundColor": "#000000", "barStyle": "light-content" }` (para builds nativos)
- `apps/mobile/app/_layout.tsx` y `apps/mobile2/app/_layout.tsx`: import de `expo-navigation-bar` + `setBackgroundColorAsync('#000000')` + `setButtonStyleAsync('light')` al arrancar (para Expo Go)
- Paquete instalado: `expo-navigation-bar ~5.0.10` hoisted al `node_modules` raíz

---

### 10. Mejoras al flujo de registro y generación de programa

**Problemas:**
1. Al registrar una cuenta nueva no había opción de elegir la fecha de inicio del programa.
2. No había opción visible para elegir entre fase de adecuación (3 semanas) o entrada directa.
3. Al presionar "Regenerar programa" en la vista Programa, el programa anterior quedaba visible (duplicación).

**Soluciones:**
1. Reemplazado el `TextInput` de fecha por tres botones pill: **Hoy** / **Mañana** / **Otra fecha**. "Otra fecha" despliega un input AAAA-MM-DD. Estado `startDateMode` controla cuál está activo.
2. El toggle de fase de adecuación (`includePreparationPhase`) se movió junto a la selección de fecha, antes de template y notas, para mayor visibilidad.
3. `GET /api/v1/athlete/programs` ahora filtra `status: { not: ProgramStatus.ARCHIVED }` — los programas archivados al regenerar no aparecen en la lista.
4. `GET /api/v1/athlete/sessions` ahora filtra sessions cuyo programa tenga `status: { not: ProgramStatus.ARCHIVED }` — las sesiones del programa anterior ya no se ven.

Ambas apps (mobile y mobile2) actualizadas. La corrección del API aplica a ambas por ser el mismo backend compartido.

---

### 11. Configuración de despliegue a producción

Se creó la infraestructura de despliegue para backend y web (las apps móviles se distribuyen por Expo/EAS):

| Archivo | Descripción |
|---------|-------------|
| `apps/api/Dockerfile.prod` | Imagen de producción: instala deps + genera Prisma client + compila TS |
| `apps/web/Dockerfile.prod` | Multi-stage: Vite build + nginx alpine |
| `apps/web/nginx.conf` | Proxy `/api/*` → `api-3m30cm:4100`, SPA fallback, gzip |
| `docker-compose.prod.yml` | Compose de producción con servicios `api-3m30cm`, `web-3m30cm` y profiles `api-migrate` / `api-seed` |
| `deploy.sh` | Script de deploy: build → push → SSH → pull → schema push → restart |

**Flujo:**
1. `./deploy.sh` construye y sube las imágenes con tag `YYYYMMDDHHMM`
2. SSH al servidor en `192.168.10.57`, directorio `~/app-server/proyectos/3m30cm`
3. Pull de nuevas imágenes, `prisma db push`, `docker compose up -d`
4. Limpieza de imágenes antiguas

**Pendiente:** migrar de `prisma db push` a `prisma migrate` cuando se quiera historial de migraciones.

---

### 12. Unificación de entorno local y producción para el web admin

**Objetivo:** evitar cambios manuales en `.env` al pasar de local a producción.

**Cambios aplicados:**
1. El frontend web ahora consume `/api/*` relativo por defecto y solo usa `VITE_API_BASE_URL` si se define explícitamente.
2. `apps/web/Dockerfile.prod` dejó de depender de un `build-arg` para la URL de API.
3. `deploy.sh` ya no inyecta `VITE_API_BASE_URL` al construir la imagen web.
4. `.env.example` y `.env` local quedaron alineados con el mismo shape base de producción: `RUN_SEED_ON_DEPLOY`, `SMTP_*`, `API_PROXY_TARGET` y override opcional para `VITE_API_BASE_URL`.

**Resultado:**
- En desarrollo, Vite resuelve `/api/*` vía proxy hacia `API_PROXY_TARGET`.
- En producción, nginx del contenedor web reenvía `/api/*` a `api-3m30cm:4100` dentro de Docker.
- El deploy inicial solo requiere que el `.env` remoto tenga secretos y endpoints reales; no hace falta reconfigurar la URL del frontend en cada release.

---

### 13. Ajuste de red externa para producción real

**Problema:** el `docker-compose.prod.yml` asumía una red externa llamada `red-produccion`, pero el servidor real expone Postgres, MinIO y otros servicios sobre `red-interna`.

**Cambios aplicados:**
1. `docker-compose.prod.yml` ahora resuelve la red externa por nombre real usando `DOCKER_EXTERNAL_NETWORK`, con default `red-interna`.
2. `deploy.sh` valida antes de correr migraciones que la red externa exista en el servidor y falla con un mensaje claro si no está.

**Resultado:**
- El deploy funciona con la red real del servidor sin tocar el script en cada release.

---

### 14. Biomecanica: baseline en DIP y referencia de aro simplificada

Se ajusto la medicion biomecanica para estabilizar los resultados del salto vertical:

1. `CENTER_OF_MASS` en `apps/web/src/biomechanicsReferenceMeasurements.ts` ahora usa `DIP` como baseline unico.
2. `CENTER_OF_MASS` escala por estatura del atleta y mide elevacion del centro hasta `APEX`.
3. `RIM_REFERENCE` se simplifico para usar la cabeza en `APEX` respecto al aro a 305 cm, y convertir salto como `altura_cabeza_en_apex - estatura`.

Validacion ejecutada durante este ajuste:

- `npm --prefix apps/web run build`
- Si en otro entorno la red cambia de nombre, basta con definir `DOCKER_EXTERNAL_NETWORK` en el `.env` remoto.

---

### 14. Mobile y mobile2 con modos explicitos dev/prod

**Problema:** cambiar entre backend local y backend publico desde Expo era fragil porque dependia de como se cargaba `EXPO_PUBLIC_API_BASE_URL` al ejecutar la app desde subdirectorios.

**Cambios aplicados:**
1. Se agrego `cross-env` en la raiz del monorepo para tener overrides portables en Windows.
2. `apps/mobile/package.json` ahora separa `dev` y `prod`, mas sus variantes `android`, `ios` y `web`.
3. `apps/mobile2/package.json` replica el mismo patron para el puerto `8082`.
4. En `dev`, los scripts limpian `EXPO_PUBLIC_API_BASE_URL` para forzar el flujo local.
5. En `prod`, los scripts fijan `EXPO_PUBLIC_API_BASE_URL=https://3m30cm.supernovatel.com`.

**Resultado:**
- `npm --prefix apps/mobile run dev` significa siempre local.
- `npm --prefix apps/mobile run prod` significa siempre produccion.
- `npm --prefix apps/mobile2 run dev` significa siempre local.
- `npm --prefix apps/mobile2 run prod` significa siempre produccion.

Esto evita volver a editar `.env` para cambiar de ambiente y reduce errores de conectividad falsos en Expo.

---

### 15. Documentacion operativa reutilizable

Se creo `supernovatel.md` en la raiz como documento operativo del proyecto.

**Contenido principal:**
- infraestructura actual
- flujo Docker local
- despliegue con `deploy.sh`
- contenedores y red externa
- convenciones para Expo en modo `dev` y `prod`

---

### 16. Reset por codigo en app y config release de mobile2

**Objetivo:** cerrar los ultimos huecos del APK de `apps/mobile2` antes de produccion: logo release, Google login Android y reset de contraseña usable dentro de la app.

**Cambios aplicados:**
1. `apps/mobile2/app.config.js` ahora carga `.env` de la raiz y expone `extra.googleClientIds` y `extra.apiBaseUrl` para builds release.
2. `apps/mobile2/app/index.tsx` ya no depende solo de `process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`; tambien usa el client ID embebido desde Expo config.
3. `apps/api/prisma/schema.prisma` agrego `code` en `PasswordResetToken`.
4. `apps/api/src/routes/auth.ts` ahora genera un codigo de 6 digitos, lo envia por email junto con el deep link y permite `reset-password` por `token` o por `email + code`.
5. `apps/mobile2/app/index.tsx` abre el modal de nueva contraseña con flujo por codigo si el usuario inicio el reset desde email y mantiene compatibilidad con deep link por token.
6. `apps/mobile2/scripts/build-android-apk.mjs` ejecuta `expo prebuild --platform android --clean --no-install` antes de Gradle para regenerar recursos nativos locales.
7. `apps/mobile2/.easignore` ahora excluye `android/` para que EAS regenere recursos nativos remotos desde la config actual en lugar de empaquetar el arbol Android viejo.

**Validacion:**
- `npm run prisma:generate --workspace @jump/api` OK
- `npm run build --workspace @jump/api` OK
- `npm --prefix apps/mobile2 run build` OK

**Operacion:**
- `npm run prisma:push --workspace @jump/api` debe ejecutarse desde la raiz del monorepo antes de desplegar el cambio de schema.
- Luego el deploy productivo sigue siendo `./deploy.sh` desde la raiz del repo.
- checklist reutilizable para el siguiente proyecto

**Objetivo:**
dejar capturado el patron real que ya funciona en `3m30cm` para reutilizarlo desde la fase de desarrollo del siguiente producto, en lugar de reconstruir decisiones de infraestructura sobre la marcha.

---

### 16. Google OAuth Android documentado para mobile2

**Datos fijos del proyecto:**
- Package / applicationId de `apps/mobile2`: `com.supernovatel.jump30cm.game`
- Scheme de deep link: `jump30cm-game`

**OAuth Android local:**
- Client ID configurado para desarrollo: `346093521498-pgavsthdan4bjfsjilgg6pbkq0436jhp.apps.googleusercontent.com`
- SHA-1 debug usado para crearlo: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

**Decisión operativa:**
- El backend ahora acepta múltiples client IDs de Google en `GOOGLE_CLIENT_ID_ANDROID` separados por coma.
- Esto permite tener un client ID Android para debug/local y otro para release/producción dentro del mismo proyecto de Google sin volver a tocar código.
- El browser OAuth de `expo-auth-session` quedo descartado para Android release porque Google devolvia `invalid_request` con el mensaje sobre `custom uri scheme`.
- Android en `apps/mobile2` ahora usa `@react-native-google-signin/google-signin` y toma el `webClientId` para obtener el `idToken`; el client Android sigue siendo obligatorio en Google Cloud para validar package + SHA-1 del build firmado.

**Obtención del SHA-1 de producción:**
- Si el APK/AAB se firma con un keystore propio en servidor, usar `keytool -list -v -keystore /ruta/al/release.keystore -alias <alias> -storepass <storepass> -keypass <keypass>`.
- Si la distribución final usa Google Play App Signing, el SHA-1 de producción que importa para OAuth sale de Play Console, en Integridad de la app, certificado de firma de la app.

---

### 17. Forgot-password estabilizado para TLS real y pruebas locales

**Problemas detectados:**
- El proveedor SMTP presentaba certificado TLS para un hostname distinto al alias usado en `SMTP_HOST`.
- En local, cuando las credenciales SMTP seguían siendo placeholders o inválidas, `forgot-password` devolvía `500` y bloqueaba el test del flujo.

**Cambios aplicados:**
1. Se añadió `SMTP_TLS_SERVERNAME` al backend para validar TLS contra el hostname correcto del certificado.
2. `POST /api/v1/auth/forgot-password` ahora en desarrollo devuelve `200` incluso si el envío SMTP falla, y escribe en logs:
	- token de reset
	- deep link `jump30cm-game://reset-password?...`
	- URL web `${WEB_URL}/reset-password?...`
3. En producción el endpoint mantiene fallo real si no puede entregar el correo, para no ocultar una caída del proveedor o credenciales rotas.

**Resultado:**
- El flujo de reset queda usable en local aunque el SMTP todavía no esté listo.
- El mismo código soporta el caso real de alias DNS + certificado distinto sin desactivar validación TLS.

---

### 18. Limpieza de TypeScript y build en mobile2

**Problemas detectados:**
- `apps/mobile2/app/index.tsx` tenía errores de narrowing en la respuesta de Google Auth y un estilo faltante.
- `apps/mobile2` heredaba errores desde componentes compartidos de `apps/mobile/components`.

**Cambios aplicados:**
1. Se corrigió el narrowing de `googleResponse.type === "success"` antes de leer `authentication`.
2. Se agregó el estilo faltante `authSt.helperText`.
3. `apps/mobile/components/ProfileModal.tsx` se alineó con `toggleTheme` en lugar del API viejo `toggleMode`.
4. `apps/mobile/components/ThemeContext.tsx` pasó de tipar la paleta como `typeof dark` a una interfaz compatible con dark y light.
5. Se validó `npm --prefix apps/mobile2 run build` con salida limpia.

**Resultado:**
- `apps/mobile2` queda TypeScript-clean tanto en la pantalla principal como en los componentes compartidos que consume.

---

### 19. Build Android local y limpieza de Problems en VS Code

**Problemas detectados:**
- `apps/mobile2` no tenía todo el árbol Android listo para un `assembleRelease` reproducible desde Windows.
- VS Code mostraba errores falsos en `node_modules/*/tsconfig.json` de paquetes Expo (`expo-auth-session`, `expo-linking`, `expo-web-browser`, `expo-image-picker`).

**Cambios aplicados:**
1. Se incorporó el scaffold Android de `apps/mobile2` y el helper `apps/mobile2/scripts/build-android-apk.mjs`.
2. El script `npm --prefix apps/mobile2 run apk:prod` ahora:
	- detecta un JDK util
	- detecta Android SDK
	- recrea `android/local.properties`
	- detiene daemons Gradle previos
	- ejecuta `gradlew assembleRelease`
3. Se añadió `.vscode/settings.json` para desactivar `project diagnostics` del tsserver y excluir `node_modules`, `.expo` y `dist` del análisis de workspace.

**Resultado:**
- El APK release ya tiene camino operativo documentado para Windows cuando el SDK está presente.
- El workspace queda limpio en VS Code sin parchear dependencias dentro de `node_modules`.

---

### 20. Google nativo + pulido auth en mobile2

**Problemas detectados:**
- El mensaje de credenciales incorrectas en `apps/mobile2` quedaba demasiado abajo en la tarjeta y se perdía visualmente.
- Había dos salidas de sesión: el drawer lateral y el modal del avatar; solo debía quedar la del avatar y además el modal no limpiaba bien el estado real de la app.
- El login de Google en Android release seguía fallando con `error 400: invalid_request` y el texto `custom uri scheme is not enabled for your android client`.

**Cambios aplicados:**
1. `apps/mobile2/app/index.tsx` ahora muestra error y mensaje de auth en un bloque visible arriba del formulario.
2. `apps/mobile/components/DrawerMenu.tsx` dejó de renderizar la opción `Cerrar sesion`.
3. `apps/mobile/components/ProfileModal.tsx` ya no borra el key incorrecto `jump-token`; delega el logout al callback real del contenedor.
4. `apps/mobile2/app/index.tsx` conecta el logout del avatar con `handleLogout()` y limpia también la sesión nativa de Google cuando aplica.
5. `apps/mobile2` agregó `@react-native-google-signin/google-signin` y Android pasó a login nativo; Expo Go/web conservan `expo-auth-session`.
6. Se revalidó el flujo completo con `npm --prefix apps/mobile2 run build` y `echo y | npm --prefix apps/mobile2 run apk:prod`.

**Resultado:**
- Queda un único logout visible, el del avatar, y ahora sí derriba el estado autenticado de la app.
- Los errores de login vuelven a quedar visibles en la tarjeta sin quedar ocultos por el resto del contenido.
- El APK release volvió a generarse correctamente en Windows tras sumar la dependencia nativa de Google.
- El punto operativo pendiente fuera del repo queda claro: si un build firmado falla en Google, hay que revisar el client OAuth Android de `com.supernovatel.jump30cm.game` y el SHA-1 real del certificado de firma, no el código JavaScript.

---

### 21. Crash de arranque por React duplicado en mobile2

**Problema detectado:**
- La app de `apps/mobile2` podia abrir y cerrarse inmediatamente con `Cannot read property 'useState' of null`.
- La causa local fue una instalacion accidental dentro de `apps/mobile2/node_modules` despues de agregar una dependencia nativa, lo que reintrodujo dos copias de React/React Native en un monorepo que espera resolverlas desde la raiz.

**Cambios aplicados:**
1. `apps/mobile2/metro.config.js` ahora prioriza `node_modules` del workspace root y fuerza `react`, `react-dom` y `react-native` desde esa ubicacion.
2. Se limpio la instalacion local equivocada (`apps/mobile2/node_modules` y `apps/mobile2/package-lock.json`).
3. La dependencia nueva se reinstalo con el lockfile correcto del workspace raiz.
4. Se revalido con `npm --prefix apps/mobile2 run build` y `npx expo export -p android --clear`.

**Resultado:**
- El crash de `useState` queda asociado al arbol de dependencias y no al `.env` ni al backend.
- El comando operativo para regenerar la APK desde la raiz sigue siendo `echo y | npm --prefix apps/mobile2 run apk:prod`.
- Si vuelve a aparecer el mismo error, revisar primero que no exista `apps/mobile2/node_modules` antes de tocar código de negocio.

---

### 22. Deploy desacoplado de mobile + automatizaciones locales en mobile2

### 23. Técnica multi-programa en backend, admin web y mobile2

**Objetivo:** preparar la plataforma para varios programas futuros (`sprint`, `agilidad`, `remate`, `salto vertical`, etc.) sin duplicar contenido técnico por atleta.

**Decisión de modelado:**
- la técnica específica vive en `ProgramTemplate`, no en `PersonalProgram`
- las métricas de seguimiento técnico viven por atleta + template, para conservar línea base y evolución sin mezclarlo con los logs operativos de sesión

**Cambios aplicados:**
1. Prisma:
	- `ProgramTemplate` ahora soporta `techniqueTitle` y `techniqueDescription`
	- nuevo modelo `ProgramTemplateTechniqueAsset` para videos/imágenes/GIFs asociados al template
	- nuevo modelo `AthleteTechniqueMetric` para registrar métricas técnicas por atleta y programa
2. API admin:
	- `PUT /api/v1/admin/program-templates/:code` ya admite actualizar texto técnico
	- `POST /api/v1/admin/program-templates/:code/technique/media` sube recursos técnicos a MinIO
	- `DELETE /api/v1/admin/program-templates/:code/technique/media/:mediaId` elimina recursos técnicos
3. API atleta:
	- `GET /api/v1/athlete/technique` devuelve la técnica del programa activo
	- `POST /api/v1/athlete/technique/metrics` guarda métricas de línea base o evolución
4. Portal web:
	- la vista de `templates` ahora permite editar texto técnico, subir recursos y eliminarlos
5. `apps/mobile2`:
	- nuevo item de menú `Técnica`
	- nueva pantalla con texto, reproducción de recursos, carga de métricas y comparativas por etiqueta (base vs última medición)

**Semilla inicial:**
- el seed del template `JUMP-MANUAL-14D` ahora deja cargada una guía mínima llamada `Técnica base de salto vertical`
- no se siembran videos fake; los recursos reales se cargan desde admin cuando estén disponibles
- el seed sigue siendo opcional para operación: localmente se puede correr dentro del contenedor `api-3m30cm-dev` si se quieren refrescar defaults, y en producción no requiere cambiar `RUN_SEED_ON_DEPLOY=0` salvo que se quiera repoblar bootstrap automáticamente

**Validación ejecutada:**
- `npm --prefix apps/api run lint`
- `npm --prefix apps/web run build`
- `npm --prefix apps/mobile2 run build`

Todos los comandos pasaron después del cambio.

**Problema detectado:**
- Ajustes recientes de `mobile2` no debian afectar el deploy productivo, pero el monorepo seguia dejando algunos acoples innecesarios entre `web`, `api` y los workspaces moviles.
- Ademas, `mobile2` ya tenia piezas sueltas para calendario/notificaciones, pero faltaba cerrar el flujo de negocio completo para recordatorios motivacionales y sesiones vencidas.

**Cambios aplicados:**
1. `apps/web/package.json` dejo de depender del paquete raiz `3m30cm-platform` para que el build web no arrastre cambios del workspace movil.
2. `apps/api/tsconfig.json` dejo de fijar `typeRoots` a una ruta que solo funcionaba fuera del contenedor; con eso el build aislado de `apps/api/Dockerfile.prod` volvio a compilar limpio.
3. `apps/api` incorporo rollover automatico de sesiones vencidas: una sesion se puede correr hasta `2` dias; si vuelve a quedar vencida fuera de ese margen, pasa a `SKIPPED`.
4. `apps/mobile2` ahora agenda recordatorios motivacionales a las `08:00` del mismo dia para la sesion destacada y sincroniza el calendario del telefono cuando el permiso ya esta concedido.
5. La vista `Hoy` se volvio mas directa para el uso diario: mensaje motivacional por tipo de sesion, CTA de inicio inmediato, CTA de precarga offline y modal destacado para el caso sin programa generado.

**Validacion ejecutada:**
- `npm --prefix apps/mobile2 run build`
- `npx expo export -p android --clear`
- `npm --prefix apps/api run prisma:generate`

### 24. Tecnicas multiples por template, assets canonicos y evolucion por tecnica

**Objetivo:** pasar del modelo de una sola tecnica por programa a un modelo con varias tecnicas, cada una con su propio media, mediciones configurables e historial comparable desde mobile2.

**Decisiones de modelado:**
- `ProgramTemplate` mantiene campos legacy de tecnica para compatibilidad, pero la fuente nueva pasa a ser `ProgramTemplateTechnique`.
- Cada tecnica puede tener sus propias definiciones de medicion (`ProgramTemplateTechniqueMeasurementDefinition`) y las metricas del atleta guardan `techniqueId`, `measurementDefinitionId` y `completedSessionsAtMeasurement`.
- Los assets nuevos ya no deben depender de `MINIO_PUBLIC_BASE_URL`; la URL canonica queda servida por la API bajo `/api/v1/assets/:bucket/*`.

**Cambios aplicados:**
1. API:
	- se agrego hidratacion compatible para migrar datos legacy a la nueva estructura de tecnicas
	- `GET /api/v1/athlete/technique` ahora devuelve `techniques[]` completo ademas del bloque legacy `technique`
	- `POST /api/v1/athlete/technique/metrics` ya registra contra una tecnica concreta y enlaza la definicion de medicion cuando existe
	- se incorporaron CRUDs admin para tecnicas, definiciones de medicion y media por tecnica
	- se agrego streaming de assets por `/api/v1/assets/:bucket/*` con soporte `Range`
2. Admin web:
	- la seccion `Técnica` ahora administra varias tecnicas por template
	- cada tecnica permite editar descripcion, instrucciones de medicion, flag de comparacion y mediciones configurables
3. `apps/mobile2`:
	- la vista `Técnica` paso a listar tecnicas del programa activo y a registrar mediciones por tecnica concreta
	- la vista `Evolución` ahora muestra historico por tecnica y comparacion entre dos tecnicas habilitadas desde admin
	- el historial visible incluye fecha y snapshot de sesiones completadas al momento de la medicion

**Validacion ejecutada:**
- `npm --prefix apps/mobile2 run build`

La validacion paso despues del refactor del cliente.

---

### 25. Analisis biomecanico automatico en mobile2 y release 2.0.0

**Objetivo:** llevar a `apps/mobile2` la misma logica biomecanica ya cerrada en web/admin, dejando `CENTER_OF_MASS` como metodo principal de altura de salto y `FLIGHT_TIME` solo como corroboracion secundaria, y sacar una APK release `2.0.0`.

**Cambios aplicados:**
1. `apps/api/src/routes/athlete.ts` ahora devuelve `biomechanicsConfig` tambien en la respuesta refrescada de `POST /api/v1/athlete/technique/metrics`, para que la app no pierda el contrato biomecanico despues de guardar una medicion.
2. `apps/web/src/biomechanicsReferenceMeasurements.ts` amplio la inferencia del ratio temporal y ahora considera tambien `1.0` cuando hay corroboracion por `CENTER_OF_MASS`.
3. `apps/mobile2/components/technique/athleteTechniqueAnalysis.ts` reutiliza la deteccion de eventos y las mediciones del web admin para construir un analisis local del atleta a partir de landmarks.
4. `apps/mobile2/components/technique/TechniqueVideoPoseAnalyzer.tsx` incorpora un `WebView` oculto que carga MediaPipe Pose JS, procesa el video del atleta y devuelve la secuencia de landmarks a React Native.
5. `apps/mobile2/components/screens/TecnicaScreen.tsx` ahora permite elegir un video del atleta, correr el analisis automatico, mostrar eventos detectados, hallazgos, checks de referencia, JSON del analisis y guardar la altura de salto estimada como metrica.
6. `apps/mobile2/app/index.tsx` propaga `heightCm`, `proVideoUrl`, `proLandmarks` y `biomechanicsConfig` hacia la pantalla de tecnica para poder escalar la medicion en centimetros.
7. `apps/mobile2/package.json`, `apps/mobile2/app.json` y el arbol Android generado quedaron alineados en version `2.0.0` con `versionCode 200`.
8. `apps/mobile2/scripts/build-android-apk.mjs` se endurecio para Windows: limpia locks de Gradle, alimenta automaticamente la confirmacion de `expo prebuild`, invoca `gradlew` con ruta explicita y alinea la version de Kotlin de `expo-dev-launcher` con la del plugin de React Native cuando hace falta.
9. `apps/mobile2/package.json` y el lockfile raiz alinearon `expo-dev-client` a la serie `~6.0.20`, que es la compatible con Expo SDK 54 y evito el choque previo de Kotlin / dev-menu durante la release.
10. `README.md` y `api_reference.md` quedaron actualizados con el flujo automatico de biomecanica en `mobile2`, el metodo principal por centro de masas y la release `2.0.0`.

**Validacion ejecutada:**
- `npm --prefix apps/mobile2 run build`
- `echo y | npm --prefix apps/mobile2 run apk:prod`

**Resultado:**
- `apps/mobile2` quedo TypeScript-clean con el nuevo flujo de analisis.
- La APK release local se genero correctamente en `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk`.
- La app ya puede analizar un video del atleta dentro de `Técnica` reutilizando el contrato biomecanico compartido en vez de duplicar logica en mobile.
- `docker build -f apps/api/Dockerfile.prod .`

**Resultado:**
- El deploy vuelve a depender solo de backend + frontend, sin quedar fragilizado por cambios de `mobile2`.
- El flujo de APK no se rompio: `mobile2` siguio pasando chequeo TypeScript y export Android despues de declarar permisos nativos y automatizaciones locales.
- El login con Google queda entendido como flujo mixto: la app obtiene el `idToken`, pero el backend lo valida contra Google antes de emitir el JWT interno de la plataforma.

### 25. APK 1.1.4 + media privada via proxy API

**Objetivo:** regenerar `mobile2` como `1.1.4` y dejar documentado que la media productiva debe entrar por la API cuando `jump-assets` es privado en MinIO.

**Cambios aplicados:**
1. `apps/mobile2/app.json` se movio a `version = 1.1.4` y `android.versionCode = 114`.
2. `apps/mobile2/package.json` se alineo a `1.1.4`.
3. `APK_RELEASES.md` paso a documentar la version `1.1.4`, el criterio para la siguiente version y el checklist operativo de release.
4. `apps/mobile2/scripts/build-android-apk.mjs` quedo endurecido para Windows: release con `--max-workers=1`, `--no-parallel` y normalizacion de `gradle.properties` despues de `prebuild`.
5. La estrategia de media quedo fijada en cliente+backend via `/api/v1/assets/...`; no se requiere volver publico el bucket `jump-assets`.

**Validacion ejecutada:**
- `npm --prefix apps/mobile2 run build`
- `echo y | npm --prefix apps/mobile2 run apk:prod`

**Resultado:**
- se genero `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk` para la release `1.1.4/114`
- queda explicitado que un cambio en la logica runtime del cliente requiere instalar una APK nueva para ser probado en dispositivo
- el helper de build Android se ajusto para reducir bloqueos de Windows, limpiar builds intermedios de Expo Android y subir memoria de Gradle/Kotlin durante `assembleRelease`

### 26. Migraciones Prisma versionadas + preparacion APK 1.2.0

**Objetivo:** pasar el deploy productivo de `db push` a migraciones versionadas, dejar listo el onboarding fisico obligatorio y preparar la siguiente release Android como `1.2.0`.

**Cambios aplicados:**
1. Se agregaron migraciones versionadas en `apps/api/prisma/migrations/` para `proVideoUrl`/`proLandmarks` y para `heightCm`/`weightKg` del atleta.
2. `docker-compose.prod.yml` y `deploy.sh` pasaron a ejecutar `api-migrate` con `prisma migrate deploy` en vez de `prisma db push`.
3. `apps/mobile2` ahora bloquea la navegacion hasta completar altura y peso, y consume esos campos desde `GET /athlete/me`.
4. `apps/mobile2/app.json` y `apps/mobile2/package.json` quedaron preparados para la release `1.2.0` con `android.versionCode = 120`.
5. Los `.md` de la raiz quedaron actualizados para reflejar el nuevo flujo de migraciones y la condicion operativa previa a distribuir la APK.

**Validacion ejecutada:**
- `npm --prefix apps/api run prisma:generate`
- `npm --prefix apps/api run lint`
- `npm --prefix apps/api exec prisma validate -- --schema apps/api/prisma/schema.prisma`
- `npm --prefix apps/mobile2 run build`

**Resultado:**
- el repo ya no deja la aplicacion del schema productivo librada a `db push`; el deploy manual pasa por migraciones versionadas
- la APK `1.2.0` queda preparada a nivel de codigo y versionado
- antes de distribuir esa APK, el paso operativo que sigue siendo obligatorio es tu `./deploy.sh` manual para que produccion tenga las migraciones aplicadas

---

### 27. Refactoring biomecánico profundo + release 2.1.0

**Objetivo:** refactorizar el módulo de análisis de técnica de salto vertical para mejorar la precisión de detección automática de hitos, implementar doble validación de altura con filtro de confianza, y añadir la base para visualización de "esqueletos fantasma" en la app.

**Cambios aplicados:**

#### apps/web/src/biomechanicsEventDetection.ts
- APEX ahora se detecta usando la serie de Centro de Masas completa `comYSeries` = promedio de (cadera izq + cadera der + hombro izq + hombro der), que representa mejor el CoM real que solo las caderas.
- `candidateApexIndex` siembra la búsqueda del tramo aéreo; `apexIndex` final es el mínimo de `comYSeries` dentro de la ventana aérea confirmada, correspondiendo al punto exacto donde $V_y = 0$.
- Esto elimina falsos positivos de APEX que antes podían caer en la fase de descenso post-aterrizaje.

#### apps/web/src/biomechanicsReferenceMeasurements.ts
- Se añadieron `LEFT_KNEE` y `RIGHT_KNEE` al mapa de índices de landmarks.
- Nueva función `measureKneeDropRelativeToHip`: mide la distancia relativa rodilla→cadera en coords. normalizadas.
- Nueva función `detectLandingTuck`: compara el drop de rodillas en el frame de despegue (TOE_OFF) vs. el frame de aterrizaje (LANDING). Si el atleta recoge las rodillas antes de aterrizar (Δ ≥ 0.06), penaliza la confianza del método FLIGHT_TIME hasta −0.20 y emite una nota explicativa ("salto con trampa").
- `buildCenterOfMassMethodPreview` ahora prefiere la altura visible del cuerpo en el frame de SETUP como regla de calibración antropométrica, en lugar del máximo global antes del despegue. Esto aprovecha que en SETUP la persona está de pie erguida, dando la referencia más fiable.
- `buildJumpHeightPreview` integra `detectLandingTuck` para aplicar la penalización antes de consolidad el consenso de altura.

#### apps/mobile2/components/technique/athleteTechniqueAnalysis.ts
- `AthleteTechniqueAngleComparison` ahora incluye `deltaPercent: number` (desviación porcentual firmada = `(atleta − referencia) / referencia × 100`).
- Nuevas interfaces: `AthleteGhostSkeletonEventFrame` y `AthleteGhostSkeletonData` que encapsulan, para cada hito clave (TOE_OFF, TAKE_OFF, APEX, DIP, LAST_CONTACT, LANDING), los landmarks de referencia en esa postura junto con los frame indices de atleta y referencia sincronizados.
- `AthleteTechniqueAutoAnalysis` añade el campo `ghostSkeleton: AthleteGhostSkeletonData | null`.
- `analyzeAthleteTechniqueVideo` ahora genera el ghost skeleton automáticamente cuando hay `referenceLandmarks`, usando TOE_OFF como punto de sincronización primario.

#### apps/mobile2/components/screens/TecnicaScreen.tsx
- Nueva función `formatSignedPercent`.
- Todos los puntos de la UI que muestran `deltaDeg` ahora también muestran `deltaPercent` entre paréntesis (p. ej., `+8.5° (+12%)`) tanto en la tarjeta de comparación de ángulos como en el overlay de eventos de video.
- `buildUserAngleHighlights` incluye el porcentaje en el texto de hallazgos automáticos.

#### apps/mobile2/scripts/build-android-apk.mjs — Optimización de builds
- Añadida función `computePrebuildFingerprint`: calcula un SHA-256 de `app.json`, `package.json` y `package-lock.json` raíz. Si el fingerprint no cambió respecto al almacenado en `android/.prebuild-fingerprint`, se salta el costoso `expo prebuild --clean`.
- Esto evita regenerar el árbol Android nativo en cada build cuando no cambiaron app.json ni dependencias, que era la principal causa de la lentitud excesiva.
- Añadido `--build-cache` al comando de Gradle para que las task outputs se reutilicen entre compilaciones cuando los inputs no varían.
- La primera ejecución (o cuando cambia fingerprint) sigue haciendo prebuild completo para garantizar corrección.

#### Versionado
- `apps/mobile2/app.json`: `version = 2.1.0`, `android.versionCode = 210`.
- `apps/mobile2/package.json`: `version = 2.1.0`.

**Validación ejecutada (2026-05-02):**
- `npm --prefix apps/mobile2 run build` → TypeScript clean, 0 errores
- `echo y | npm --prefix apps/mobile2 run apk:prod` → BUILD SUCCESSFUL en 12m 9s (607 tasks: 607 ejecutadas, 87 from cache)
- APK generado: `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk` — 96.3 MB

**Resultado:**
- El portal admin web (`apps/web`) y la app móvil (`apps/mobile2`) comparten la misma lógica mejorada de detección y medición vía el módulo compartido en `apps/web/src/`.
- La detección de APEX es más precisa: ya no cae en fases de descenso post-aterrizaje.
- El sistema detecta automáticamente el "salto con trampa" (rodillas recogidas antes de aterrizar) y penaliza la confianza del método de tiempo de vuelo, priorizando el CoM.
- La calibración de CoM en píxeles→cm usa la postura de pie más fiable (frame de SETUP).
- Los ángulos comparativos ahora muestran tanto la diferencia absoluta en grados como la diferencia porcentual respecto a la referencia.
- La app exporta los datos de ghost skeleton listos para que el componente de video superponga el esqueleto de referencia sobre el video del atleta, sincronizado en TOE_OFF.
- Los builds se vuelven significativamente más rápidos en el segundo ciclo cuando `app.json` y dependencias no cambiaron.

---

### 28. Detección LANDING-first + limpieza pantalla Hoy + v2.1.1

**Objetivo:** hacer la detección de eventos más robusta ante clips donde el descenso post-aterrizaje confundía al detector, y eliminar contenido de técnica/referencia que aparecía incorrectamente en la pantalla Hoy.

#### apps/web/src/biomechanicsEventDetection.ts — nueva estrategia de ancla
- **Antes:** el ancla era `candidateApexIndex` = mínimo global de hipY desde el 15% del clip. Si el clip incluía descenso post-aterrizaje con rodillas bajas, el "candidato" podía caer fuera del tramo aéreo real.
- **Ahora:** el ancla es **LANDING** = fin del último tramo aéreo significativo (duración ≥ `fps/8` frames). La transición airborne→grounded es una señal dura y muy fiable. Desde ahí se deriva hacia atrás: APEX dentro de la ventana aérea, luego TOE_OFF, TAKE_OFF, DIP, pasos de contacto.
- Eliminadas las variables `candidateApexIndex` y `airborneRunAroundApex`; reemplazadas por `jumpAirborneRun` (último run aéreo suficientemente largo).

#### apps/mobile2/components/screens/HoyScreenV2.tsx — limpieza
- Eliminado el bloque JSX "programa activo" (eyebrow + título + descripción + video de referencia) que aparecía en la pantalla Hoy.
- Eliminadas las 4 variables asociadas (`programOverviewAsset`, `programOverviewUri`, `programOverviewTitle`, `programOverviewDescription`).
- Eliminados los imports `expo-image` y `expo-av` que solo servían para ese bloque.
- Eliminados los 6 estilos `programOverview*`.

#### Contexto: fps mismatch entre video de referencia y video de atleta
- El video de referencia biomecánico es cámara lenta (SLOW_MOTION); el video del atleta se graba a velocidad normal (REAL_TIME).
- El sistema ya maneja esto correctamente: `biomechanicsReferenceMeasurements.ts` tiene lógica de `playbackCandidates` que prueba ratios 0.5 y 0.25 para SLOW_MOTION y selecciona el candidato con mejor acuerdo con el método CoM.
- Para el atleta, `analyzeAthleteTechniqueVideo` fija `athleteMotionProfile = "REAL_TIME"`, por lo que la detección de eventos y el cálculo de tiempo de vuelo usan ratio 1:1.
- La comparación de ángulos (ghostSkeleton + angleComparisons) es independiente del fps: trabaja en índices de frames normalizados por evento, no en tiempo absoluto.

#### Versionado
- `apps/mobile2/app.json`: `version = 2.1.1`, `android.versionCode = 211`
- `apps/mobile2/package.json`: `version = 2.1.1`

---

### 29. Fix LAST_CONTACT + distancias de paso + ángulos por defecto v2.1.2

**Objetivo:** corregir la detección de LAST_CONTACT (se detectaba en zona aérea), agregar medición automática de distancias horizontales de pasos de aproximación, y auto-crear las configuraciones de ángulos biomecánicos al autodetectar eventos.

#### apps/web/src/biomechanicsEventDetection.ts — fix LAST_CONTACT
- **Antes:** `lastContactIndex = lastSupportRun?.start` — podía fallar cuando la fase bilateral tenía el mismo side-label que el paso penúltimo (el selector alternante lo omitía), colocando el evento en zona aérea.
- **Ahora:** se busca el último run aéreo de aproximación dentro de `[0, toeOffIndex]` (`airborneRuns.at(-1)`) y LAST_CONTACT = primer frame grounded justo después de ese run. Esto ancla el evento al vuelo de paso entre penúltimo y planta bilateral, que es una señal dura y confiable.

#### apps/web/src/biomechanicsReferenceMeasurements.ts — distancias de paso
- Nueva interfaz `ReferenceApproachStepDistancesPreview` con campos `prePenultimateFlightDistanceCm`, `lastStepDistanceCm`, `calibrated`, `notes`.
- `ReferenceBiomechanicsMeasurementsPreview` tiene el nuevo campo `stepDistances`.
- Función `buildApproachStepDistancesPreview`: calcula la distancia horizontal entre centros de cadera en ANTEPENULTIMATE→PENULTIMATE y PENULTIMATE→LAST_CONTACT. Calibra usando la altura visible del cuerpo en frames cercanos al SETUP y el `subjectHeightCm` del jumpHeightMeasurement.
- Umbrales de alerta: ANTEPENULTIMATE→PENULTIMATE debe ser >200cm, PENULTIMATE→LAST_CONTACT debe ser <50cm.

#### apps/web/src/App.tsx — auto-crear ángulos en autodetección
- Nueva función `buildDefaultAngleCheckDrafts(keyEventDrafts)` que genera 6 ángulos estándar para salto vertical con carrera:
  - Rodilla izq./der. en DIP
  - Cadera izq./der. en LAST_CONTACT
  - Rodilla izq./der. en TOE_OFF
- Solo agrega los ángulos si el check es el primero (no hay ángulos previos) para no duplicar.
- `handleAutoDetectReferenceEvents` ahora también agrega estos ángulos por defecto al autodetectar.
- Nuevo card de "Distancias de pasos de aproximación" en el preview de biomecánica del portal web.

#### Versionado
- `apps/mobile2/app.json`: `version = 2.1.2`, `android.versionCode = 212`
- `apps/mobile2/package.json`: `version = 2.1.2`

---

### 30. Distancias pie-a-pie + flujo ángulos en 2 pasos v2.1.3

**Objetivo:** corregir la medición de distancia de pasos para que sea pie-a-pie (tobillo del pie de apoyo), y cambiar el flujo de ángulos biomecánicos para que sea un segundo paso explícito con valores medidos en la referencia real.

#### apps/web/src/biomechanicsReferenceMeasurements.ts — distancias pie-a-pie
- `buildApproachStepDistancesPreview` ahora usa la posición X del tobillo de apoyo en cada evento de contacto:
  - En ANTEPENULTIMATE y PENULTIMATE: se usa el tobillo con mayor Y (más próximo al suelo = pie de apoyo).
  - En LAST_CONTACT: se usa el promedio X de ambos tobillos (planta bilateral).
- Antes se usaba el centro de las caderas, que mide la traslación del COG, no la longitud real del paso.
- La calibración usa la altura visible del cuerpo normalizada vs. `subjectHeightCm`. La escala X/Y se asume equivalente (cámara lejana).

#### apps/web/src/App.tsx — flujo de ángulos en 2 pasos
- Eliminada la auto-creación de ángulos al autodetectar eventos (`buildDefaultAngleCheckDrafts` reemplazado).
- Nueva función `buildAutoSuggestedAngleCheckDrafts(landmarks, keyEventDrafts)`:
  - Para cada evento detectado (DIP, LAST_CONTACT, TAKE_OFF, TOE_OFF, APEX), sugiere ángulos articulares relevantes.
  - Mide el ángulo real en el frame de referencia con `measureAngleDegFromLandmarks`.
  - `targetMinDeg = medido - 15°`, `targetMaxDeg = medido + 15°`.
  - Total: hasta 16 ángulos sugeridos (2 rodillas + 2 troncos en DIP, 4 en LAST_CONTACT, etc.).
- Nuevo botón **"Autodetectar ángulos"** en la sección de Ángulos clave:
  - Deshabilitado si no hay landmarks procesados o si no hay eventos detectados.
  - Tooltip explicativo.
  - Reemplaza solo los ángulos previamente auto-sugeridos (notes comienzan con "Auto-sugerido"); los ángulos manuales se preservan.
- Flujo de uso: (1) Autodetectar eventos → (2) Autodetectar ángulos → (3) El coach revisa y descarta los que no aplican.

#### Versionado
- `apps/mobile2/app.json`: `version = 2.1.3`, `android.versionCode = 213`
- `apps/mobile2/package.json`: `version = 2.1.3`

---

### 31. Depuración de eventos + wizard de ángulos v2.1.4

**Objetivo:** Reducir el ruido de eventos biomecánicos, redefinir TOE_OFF como bilateral, e implementar un wizard modal paso a paso para la autodetección de ángulos.

#### apps/web/src/biomechanicsEventDetection.ts
- **Eliminados de `AutoDetectedTechniqueEventType` y del output:** `LAST_CONTACT`, `TAKE_OFF`, `FLIGHT`.
- **TOE_OFF redefinido:** ya no es `firstAirborneIndex - 1` (que podía caer en el aire) sino la **última trama antes del despegue donde ambos pies están simultáneamente en el suelo** (`leftGround.flags[i] && rightGround.flags[i]`). Búsqueda hasta 12 tramas atrás desde `firstAirborneIndex`; fallback a `firstAirborneIndex - 1` si no se encuentra.
- Los bounds del análisis de carrera de aproximación (`supportRuns`, `airborneRuns`, `fallbackSupportPeaks`) siguen usando `toeOffIndex = firstAirborneIndex - 1` para no perder la fase bilateral en el análisis de apoyos.

#### apps/web/src/App.tsx — opciones de eventos
- Agregado `activeBiomechanicsEventTypeOptions` (sin LAST_CONTACT, TAKE_OFF, FLIGHT) usado en el selector de tipo de evento al crear eventos manualmente.
- `biomechanicsEventTypeOptions` se mantiene con todos los tipos para backward compat en dropdowns de anchor/filtro.
- Valor por defecto de `pendingEventType` y reset cambiado de `TAKE_OFF` a `TOE_OFF`.
- Botón "+" rápido de nuevo evento cambiado de `TAKE_OFF` a `TOE_OFF`.
- Progresión de cadera por defecto: último paso cambiado de `LAST_CONTACT` a `TOE_OFF`.

#### apps/web/src/App.tsx — ángulos auto-sugeridos
- Definiciones actualizadas: eliminados LAST_CONTACT (4 ángulos) y TAKE_OFF (2 ángulos).
- Agregados 4 ángulos para LANDING (rodillas + caderas).
- TOE_OFF mantiene 4 ángulos (rodillas + tobillos), ahora llamados "Salida de Punta".
- Total: 14 ángulos sugeribles (DIP×4, TOE_OFF×4, APEX×2, LANDING×4).

#### apps/web/src/App.tsx — wizard modal de autodetección de ángulos
- `handleAutoDetectReferenceAngles` ya no aplica ángulos directamente; abre un wizard modal.
- **Paso 1 — Seleccionar eventos:** checkboxes con todos los eventos que tienen frameIndex y producen sugerencias. Por defecto todos seleccionados.
- **Paso 2 — Revisar ángulos (evento a evento):** para cada evento seleccionado, muestra los ángulos sugeridos con su valor medido. Cada uno tiene botón toggle "✓ Incluir" / "Omitir". Navegación con "← Anterior" / "Siguiente evento →" / "Finalizar y agregar".
- Al finalizar: los ángulos marcados como "Incluir" se agregan al formulario (reemplazando auto-sugeridos previos, preservando manuales). Un mensaje confirma cuántos se agregaron.
- Todo sigue bajo el flujo de "Guardar técnica" — el wizard no guarda nada por sí solo.

#### Versionado
- `apps/mobile2/app.json`: `version = 2.1.4`, `android.versionCode = 214`
- `apps/mobile2/package.json`: `version = 2.1.4`

