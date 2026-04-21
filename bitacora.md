# Bitácora del Proyecto 3m30cm

## Resumen del Proyecto

**3m30cm-platform** es un monorepo (npm workspaces) para una plataforma de entrenamiento de salto vertical. Contiene:

- **apps/api** – API REST con Express, Prisma y PostgreSQL
- **apps/web** – Panel web (Vite + React 19)
- **apps/mobile** – App móvil principal (Expo SDK 54 + React Native 0.81)
- **apps/mobile2** – Variante gamificada de la app móvil (Expo SDK 54)
- **packages/shared** – Tipos y utilidades compartidas

---

## Registro de trabajo

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
- Si en otro entorno la red cambia de nombre, basta con definir `DOCKER_EXTERNAL_NETWORK` en el `.env` remoto.

