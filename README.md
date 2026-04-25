# 3m30cm

Monorepo de la plataforma de planificacion y seguimiento de salto vertical para atletas, entrenadores y equipos.

## Documentacion clave

- `README.md`: entrada rapida del repo.
- `supernovatel.md`: infraestructura actual, flujo Docker local, despliegue con `deploy.sh` y patron reutilizable para proyectos futuros.
- `api_reference.md`: endpoints y variables de entorno de la API.
- `bitacora.md`: registro historico de decisiones y cambios.

## Stack

- **Apps moviles**: Expo SDK 54 + React Native 0.81 + Expo Router (mobile en puerto 8081, mobile2 gamificada en 8082)
- **Panel web**: React 19 + Vite + TypeScript
- **API**: Node.js + Express + Prisma + TypeScript
- **Base de datos**: PostgreSQL
- **Media**: MinIO/S3
- **Infra local**: Docker Compose sobre la red compartida `red-desarrollo`
- **Infra produccion**: Docker Hub + SSH deploy mediante `deploy.sh`

## Estructura

- `apps/api`: API REST y modelo Prisma
- `apps/web`: portal web para admin, platform admin y staff
- `apps/mobile`: app movil del atleta
- `apps/mobile2`: variante gamificada de la app del atleta
- `packages/shared`: constantes y tipos de dominio compartidos

## Estado actual

- El microciclo base de 14 dias ya esta modelado como bootstrap en la API.
- La dosificacion exacta por ejercicio queda como dato editable en el portal admin.
- El esquema Prisma contempla usuarios, equipos, atletas, catalogo de ejercicios, media, plantillas, sesiones y billing.
- El portal web permite login, CRUD de ejercicios, carga de media a MinIO, edicion de prescripciones por dia, alta/edicion/baja de equipos, staff, atletas y asignaciones coach-atleta, mas generacion de programas personalizados.
- El portal web permite ademas gestionar varias tecnicas por programa: cada tecnica tiene texto explicativo, instrucciones de medicion, flag de comparacion, mediciones configurables y uno o varios recursos de media para sprint, agilidad, remate, salto vertical o cualquier otro bloque futuro.
- La API expone gestion de equipos, membresias, perfiles de atleta, asignacion coach-atleta, generacion de `PersonalProgram` con `ScheduledSession`, multiples tecnicas por `ProgramTemplate`, streaming de assets via `/api/v1/assets/:bucket/*` y endpoints operativos del atleta para agenda, logging y seguimiento tecnico.
- Las app moviles consumen login, registro con seleccion de fecha de inicio y fase de adecuacion, perfil, programas (un programa activo a la vez por atleta), sesiones, progreso consolidado, feedback automatico, guia especifica por sesion y ejercicio, persistencia local, registro de cumplimiento con metricas, una vista `Técnica` para elegir la tecnica activa y una vista `Evolución` que ya muestra historico/comparacion por tecnica.
- Se eliminan automaticamente los programas archivados de la vista de sesiones cuando se regenera un programa.
- `forgot-password` ya soporta envio SMTP con override de TLS por `SMTP_TLS_SERVERNAME` y, en desarrollo, hace fallback a log con token, deep link y URL de reset si el SMTP falla, sin bloquear las pruebas locales.
- `forgot-password` ahora tambien emite un codigo de 6 digitos persistido en Prisma para que `apps/mobile2` pueda restablecer la clave dentro de la app sin depender solo del deep link.
- `apps/mobile2` ya queda build-clean con `npm --prefix apps/mobile2 run build` y tiene helper dedicado para ensamblar APK release desde Windows cuando hay JDK + Android SDK instalados.
- `apps/mobile2` mantiene los client IDs de Google en la config embebida de Expo (`app.config.js`), pero Android ya usa login nativo con `@react-native-google-signin/google-signin`; Expo Go y web siguen usando `expo-auth-session`.

## Requisitos previos

1. Tener levantados `postgres-local` y `minio-local` en la red `red-desarrollo`.
2. Usar Node 20+ y npm 10+ si vas a correr fuera de Docker.

## Desarrollo local

### Provisionar base de datos

Con `postgres-local` disponible en `localhost:5433`, aplica schema y seed inicial:

```bash
docker compose -f docker-compose.local.yml exec api-3m30cm npm run prisma:push --workspace @jump/api
docker compose -f docker-compose.local.yml exec api-3m30cm npm run db:seed --workspace @jump/api
```

Esos comandos se lanzan desde la raiz del monorepo (`c:\Users\arman\Gon_local\Desarrollos\3m30cm`) pero ejecutan Prisma y seed dentro del contenedor `api-3m30cm-dev`, que ya resuelve `postgres-local:5432` y `minio-local:9000` por red Docker.

En local hay dos escenarios validos:

- Si levantas `docker compose -f docker-compose.local.yml up --build`, la API local ya ejecuta automaticamente `prisma:generate`, `db:ensure`, `prisma:push` y `db:seed` al arrancar.
- Los comandos manuales anteriores solo hacen falta si ya tenias el stack levantado y quieres reaplicar cambios de schema o bootstrap sin recrear el compose.
- Solo si eliges correr Prisma desde el host Windows, debes sobreescribir `DATABASE_URL` a `localhost:5433`, porque `postgres-local` no resuelve fuera de Docker.

### API y web con Docker

La fuente de verdad del entorno local es `.env`. El backend y la web se levantan en contenedores sobre `red-desarrollo`; la app movil se ejecuta fuera de Docker en tu host.

La web usa `/api/*` relativo por defecto tanto en desarrollo como en produccion. En local, Vite proxy pasa esas requests a `API_PROXY_TARGET`; `VITE_API_BASE_URL` queda solo como override opcional para casos especiales.

```bash
docker compose -f docker-compose.local.yml up --build
```

Al arrancar, la API intenta crear la base indicada en `DATABASE_URL` si no existe, luego ejecuta `prisma db push` y el seed inicial.

Servicios esperados:

- API: `http://localhost:4100/api/v1/health`
- Login: `POST http://localhost:4100/api/v1/auth/login`
- Perfil actual: `GET http://localhost:4100/api/v1/auth/me`
- Resumen admin protegido: `GET http://localhost:4100/api/v1/admin/summary`
- CRUD admin de ejercicios: `GET/POST/PUT/DELETE http://localhost:4100/api/v1/admin/exercises`
- Upload de media: `POST http://localhost:4100/api/v1/admin/exercises/:id/media`
- Reemplazo de prescripciones por dia: `PUT http://localhost:4100/api/v1/admin/program-templates/JUMP-MANUAL-14D/days/:dayNumber/prescriptions`
- Listado de tecnicas del template: `GET http://localhost:4100/api/v1/admin/program-templates/:code/techniques`
- Alta de tecnica del template: `POST http://localhost:4100/api/v1/admin/program-templates/:code/techniques`
- Edicion de tecnica del template: `PUT http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId`
- Baja de tecnica del template: `DELETE http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId`
- Alta de definicion de medicion: `POST http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId/measurements`
- Edicion de definicion de medicion: `PUT http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId/measurements/:measurementId`
- Baja de definicion de medicion: `DELETE http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId/measurements/:measurementId`
- Upload de recurso tecnico del programa: `POST http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId/media`
- Eliminacion de recurso tecnico del programa: `DELETE http://localhost:4100/api/v1/admin/program-templates/:code/techniques/:techniqueId/media/:mediaId`
- Streaming de asset tecnico o de ejercicio: `GET http://localhost:4100/api/v1/assets/:bucket/*`
- Listado y alta de equipos: `GET/POST http://localhost:4100/api/v1/admin/teams`
- Actualizacion de equipo: `PUT http://localhost:4100/api/v1/admin/teams/:teamId`
- Alta de coach o team admin: `POST http://localhost:4100/api/v1/admin/teams/:teamId/members`
- Edicion y baja de staff: `PUT/DELETE http://localhost:4100/api/v1/admin/teams/:teamId/members/:membershipId`
- Alta de atleta y perfil deportivo: `POST http://localhost:4100/api/v1/admin/teams/:teamId/athletes`
- Edicion y baja de atleta del equipo: `PUT/DELETE http://localhost:4100/api/v1/admin/teams/:teamId/athletes/:athleteProfileId`
- Asignacion coach-atleta: `POST http://localhost:4100/api/v1/admin/teams/:teamId/athletes/:athleteProfileId/assign-coach`
- Baja de asignacion coach-atleta: `DELETE http://localhost:4100/api/v1/admin/teams/:teamId/athletes/:athleteProfileId/assignments/:assignmentId`
- Listado de programas personalizados: `GET http://localhost:4100/api/v1/admin/programs`
- Generacion de programa + sesiones: `POST http://localhost:4100/api/v1/admin/programs/generate`
- Sesiones de un programa para operaciones manuales: `GET http://localhost:4100/api/v1/admin/programs/:programId/sessions`
- Detalle admin de una sesion: `GET http://localhost:4100/api/v1/admin/sessions/:sessionId`
- Reprogramacion y cambio de estado manual: `PUT http://localhost:4100/api/v1/admin/sessions/:sessionId`
- Perfil del atleta autenticado: `GET http://localhost:4100/api/v1/athlete/me`
- Tecnicas del programa activo para el atleta: `GET http://localhost:4100/api/v1/athlete/technique`
- Alta de metrica tecnica del atleta: `POST http://localhost:4100/api/v1/athlete/technique/metrics`
- Programas del atleta: `GET http://localhost:4100/api/v1/athlete/programs`
- Progreso consolidado del atleta: `GET http://localhost:4100/api/v1/athlete/progress`
- Agenda del atleta: `GET http://localhost:4100/api/v1/athlete/sessions`
- Detalle de sesion del atleta: `GET http://localhost:4100/api/v1/athlete/sessions/:sessionId`
- Logging de cumplimiento: `POST http://localhost:4100/api/v1/athlete/sessions/:sessionId/logs`
- Registro del device token del atleta: `POST http://localhost:4100/api/v1/athlete/device-tokens`
- Dashboard coach con atletas, sesiones y logs: `GET http://localhost:4100/api/v1/coach/dashboard`
- Detalle coach de una sesion asignada: `GET http://localhost:4100/api/v1/coach/sessions/:sessionId`
- Bootstrap del programa: `http://localhost:4100/api/v1/bootstrap/program-template`
- Catalogo persistido: `http://localhost:4100/api/v1/catalog/exercises`
- Plantilla persistida: `http://localhost:4100/api/v1/templates/program-templates/JUMP-MANUAL-14D`
- Web admin: `http://localhost:4173`

### Credenciales iniciales sembradas

- Email: `admin@3m30cm.local`
- Password: `Admin123!`

Estas credenciales salen del seed y deben cambiarse cuando el flujo de auth quede completo.

### Mobile con Expo

Las apps moviles no se dockerizan. Se ejecutan desde tu host y ya traen dos modos explicitos:

- `dev`: fuerza modo local.
- `prod`: fuerza consumo del backend publico `https://3m30cm.supernovatel.com`.

Comandos principales:

```bash
npm --prefix apps/mobile run dev
npm --prefix apps/mobile run prod

npm --prefix apps/mobile2 run dev
npm --prefix apps/mobile2 run prod
npm --prefix apps/mobile2 run build
npm --prefix apps/mobile2 run apk:prod
```

Atajos desde la raiz para modo local:

```bash
npm install
npm run dev:mobile
npm run dev:mobile2
```

Si quieres abrir Expo Web desde la raiz del monorepo, usa estos comandos y no `npx expo start --web` en la raiz, porque ese caso levanta Metro fuera de `apps/mobile` o `apps/mobile2` y rompe la resolucion de `expo-router`:

```bash
npm run dev:mobile:web
npm run dev:mobile2:web
```

Equivalentes por app:

- `npm --prefix apps/mobile run android`
- `npm --prefix apps/mobile run android:prod`
- `npm --prefix apps/mobile run ios`
- `npm --prefix apps/mobile run ios:prod`
- `npm --prefix apps/mobile run web`
- `npm --prefix apps/mobile run web:prod`
- `npm --prefix apps/mobile2 run android`
- `npm --prefix apps/mobile2 run android:prod`
- `npm --prefix apps/mobile2 run ios`
- `npm --prefix apps/mobile2 run ios:prod`
- `npm --prefix apps/mobile2 run web`
- `npm --prefix apps/mobile2 run web:prod`

Notas de runtime:

- En `dev`, los scripts limpian `EXPO_PUBLIC_API_BASE_URL` y la app cae al flujo local definido en `runtimeConfig.ts`.
- En `prod`, los scripts fuerzan `EXPO_PUBLIC_API_BASE_URL=https://3m30cm.supernovatel.com`.
- Ya no hace falta editar `.env` para alternar entre backend local y backend publico.
- `npm --prefix apps/mobile2 run build` corre `tsc --noEmit` para validar el workspace compartido antes de probar Expo o Android.
- `npm --prefix apps/mobile2 run apk:prod` usa `apps/mobile2/scripts/build-android-apk.mjs`, detecta `JAVA_HOME`/Android SDK, recrea `android/local.properties` y ejecuta `gradlew assembleRelease`; sin Android SDK instalado el build falla por prerequisito, no por la app.
- Si VS Code sigue mostrando errores en `node_modules/*/tsconfig.json` de Expo despues de actualizar el repo, recarga la ventana o reinicia TypeScript para que tome `.vscode/settings.json`.

Flujo validado para release Android en Windows:

- Orden recomendado: `npm --prefix apps/mobile2 run build` y luego `echo y | npm --prefix apps/mobile2 run apk:prod`.
- Si quieres regenerar la APK manualmente para probar el estado actual, usa exactamente `echo y | npm --prefix apps/mobile2 run apk:prod` desde la raiz del monorepo.
- El helper de APK tarda porque rehace `expo prebuild --clean`, regenera recursos nativos, empaqueta JS/assets y vuelve a compilar Gradle/Kotlin/dependencias nativas antes de firmar el APK.
- El helper local de `mobile2` ahora fuerza un release Gradle mas conservador en Windows (`workers=1`, `no-parallel`, Kotlin in-process) para evitar crashes intermitentes de Worker Daemon durante `assembleRelease`.
- La ultima version release generada localmente queda en `1.1.4` (`versionCode 114`) y el artefacto esperado sigue siendo `apps/mobile2/android/app/build/outputs/apk/release/app-release.apk`.
- Android release ya no usa el browser OAuth de `expo-auth-session`; usa Google Sign-In nativo. Si Google falla en un APK/AAB firmado, el primer punto a revisar ya no es el `.env`, sino el client OAuth Android en Google Cloud para `com.supernovatel.jump30cm.game` y el SHA-1 real del certificado con el que se firmo ese build.
- El backend sigue necesitando `GOOGLE_CLIENT_ID_WEB` y `GOOGLE_CLIENT_ID_ANDROID` porque la app no abre sesion sola: entrega un `idToken` a `/api/v1/auth/google` y el servidor valida contra Google que ese token fue emitido para una audiencia permitida antes de crear el JWT propio de la plataforma.
- Si la app abre y se cierra con `Cannot read property 'useState' of null`, el primer punto a revisar no es Google sino una instalacion local accidental en `apps/mobile2/node_modules`; el flujo correcto del monorepo deja una sola copia de React en el `node_modules` raiz.
- `mobile2` ya deja declarados permisos nativos para notificaciones y calendario; la validacion posterior al cambio volvio a pasar con `npm --prefix apps/mobile2 run build` y `npx expo export -p android --clear`.

Tecnica multi-programa:

- El punto de asociacion es `ProgramTemplate`, no `PersonalProgram`; asi una tecnica de sprint, agilidad, remate o salto vertical se define una sola vez y luego la consumen todos los atletas que usen ese template.
- Cada `ProgramTemplate` ahora puede tener varias tecnicas (`ProgramTemplateTechnique`) y cada tecnica define su propio texto, media, instrucciones de medicion, flag `comparisonEnabled` y varias definiciones de medicion (`ProgramTemplateTechniqueMeasurementDefinition`).
- El seed actual deja una base textual para `JUMP-MANUAL-14D` bajo "Técnica base de salto vertical" para que `mobile2` no arranque vacio aunque todavia no se hayan cargado videos desde admin.
- Ese seed no es una migracion: el schema nuevo se aplica con `prisma:push`; el seed solo inserta o refresca datos bootstrap/default, por ejemplo el texto inicial de técnica del template base.
- En produccion no hace falta cambiar `RUN_SEED_ON_DEPLOY=0` para desplegar este feature. Solo ponlo en `1` si quieres que el deploy tambien ejecute el seed y repueble defaults automaticamente.
- Los uploads nuevos ya no persisten `MINIO_PUBLIC_BASE_URL` como URL final: la API devuelve rutas canonicas bajo `/api/v1/assets/...` para que web y APK consuman media sin depender de `localhost:9000`.
- Si una APK vieja sigue intentando abrir `https://s3.supernovatel.com/jump-assets/...` y el bucket es privado, esa build no vera la media. La app correcta debe pedirla via backend usando `/api/v1/assets/...`, por eso cualquier cambio en esa logica cliente requiere regenerar e instalar una APK nueva.
- La vista `Técnica` de `mobile2` muestra una lista de tecnicas del programa activo, permite elegir la tecnica concreta, registrar mediciones por definicion configurada y guardar el snapshot de sesiones completadas al momento de medir.
- La vista `Evolución` de `mobile2` ahora agrega historico por tecnica y comparacion entre dos tecnicas marcadas como comparables por admin.

Interaccion con calendario y recordatorios en `mobile2`:

- La sesion destacada del dia mantiene un tono motivacional en la vista `Hoy` y prioriza dos acciones directas: iniciar ahora o precargar offline.
- Si el permiso ya fue concedido, la app actualiza automaticamente el evento del calendario del dispositivo para la sesion destacada y programa un recordatorio local a las `08:00` del mismo dia.
- Si una sesion vence sin completarse, el backend la recorre automaticamente al siguiente dia hasta un maximo de `2` reprogramaciones; si se vuelve a vencer fuera de ese limite, queda marcada como perdida (`SKIPPED`).
- Ese rollover corre del lado API para que el estado siga consistente aunque el usuario cambie de dispositivo; la validacion productiva del backend se repitio con `docker build -f apps/api/Dockerfile.prod .` y siguio pasando.

## Proximos pasos recomendados

1. Integrar billing real para cuentas individuales y equipos.
2. Añadir captura de metricas mas ricas en el log del atleta (altura de salto, carga, velocidad).
3. Añadir envio real de push remotas usando los `DeviceToken` registrados.
4. Expandir la vista coach con drill-down por atleta y filtros de cumplimiento.
5. Migrar el schema de `prisma db push` a `prisma migrate` para historial de migraciones en produccion.

## Despliegue a produccion

El despliegue cubre solo `apps/api` y `apps/web`. Las apps moviles se distribuyen por Expo/EAS.

Estado validado del deploy tras la estabilizacion de mobile2:

- Los cambios de `mobile` y `mobile2` ya no vuelven a contaminar el deploy web por dependencia innecesaria al paquete raiz del monorepo.
- `apps/api/Dockerfile.prod` y `apps/web/Dockerfile.prod` se pueden validar por separado; el despliegue a produccion sigue dependiendo unicamente de backend y frontend.

### Prerrequisitos en el servidor

- Docker y Docker Compose instalados.
- Red externa Docker disponible. Por defecto este proyecto usa `red-interna` en producción. Si tu servidor usa otro nombre, puedes sobreescribirlo con `DOCKER_EXTERNAL_NETWORK` en el `.env` del servidor.
- Directorio `~/app-server/proyectos/3m30cm` con un archivo `.env` de produccion.
- Archivo `docker-compose.prod.yml` copiado al mismo directorio.

### Ejecutar el deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

El script:
1. Construye la imagen de la API (`apps/api/Dockerfile.prod`) con el codigo compilado de TypeScript.
2. Construye la imagen del web (`apps/web/Dockerfile.prod`) con Vite produccion + nginx; el frontend consume `/api/*` sobre el mismo dominio por defecto.
3. Hace push de ambas imagenes a Docker Hub con tag `YYYYMMDDHHMM`.
4. Se conecta por SSH al servidor, descarga las nuevas imagenes, aplica el schema Prisma y reinicia los contenedores.

Para el detalle completo del flujo, convenciones y decisiones de infraestructura, ver `supernovatel.md`.

Para ejecutar el seed en el siguiente deploy:
```bash
# En el .env del servidor
RUN_SEED_ON_DEPLOY=1
```

Si antes del deploy quieres aplicar manualmente el cambio de schema en tu entorno actual, hazlo tambien desde la raiz del monorepo:

```bash
# local docker
docker compose -f docker-compose.local.yml exec api-3m30cm npm run prisma:push --workspace @jump/api

# seed local opcional para refrescar defaults/bootstraps
docker compose -f docker-compose.local.yml exec api-3m30cm npm run db:seed --workspace @jump/api
```

En produccion, `deploy.sh` ya corre `api-migrate` con `prisma:push`; el seed sigue siendo opcional y queda gobernado por `RUN_SEED_ON_DEPLOY`.
