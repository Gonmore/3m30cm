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
- La app Expo en `apps/mobile2` sigue usando un único `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` por build, que debe corresponder al certificado con el que se firma ese build.

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

