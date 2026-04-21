# Supernovatel

Este documento deja escrito el patron operativo que hoy usa `3m30cm` para que pueda replicarse desde el dia 1 en el siguiente proyecto sin volver a redescubrir lo mismo.

La idea no es solo documentar que existe hoy, sino dejar claras las decisiones que simplifican desarrollo, deploy y operacion.

## 1. Objetivo del patron

El objetivo es trabajar con una sola base de codigo y con un flujo que cumpla estas reglas:

1. El backend y el frontend web corren igual de bien en local y en produccion usando Docker.
2. El frontend web no depende de hardcodear la URL del API para cada ambiente; por defecto consume `/api/*` en mismo origen.
3. Las apps Expo pueden arrancar en modo local o en modo produccion sin editar `.env` a mano.
4. El deploy a produccion se hace desde un solo script (`deploy.sh`) que construye, publica y actualiza el servidor.
5. La infraestructura externa del servidor se desacopla del repo usando variables como `DOCKER_EXTERNAL_NETWORK` y un `.env` remoto.

## 2. Infraestructura actual de 3m30cm

### Monorepo

- `apps/api`: API Express + Prisma + PostgreSQL.
- `apps/web`: panel web React + Vite.
- `apps/mobile`: app Expo principal.
- `apps/mobile2`: app Expo secundaria/gamificada.
- `packages/shared`: codigo compartido.

### Produccion actual

- Dominio publico: `https://3m30cm.supernovatel.com`
- Docker Hub: imagenes `gonmore14/api-3m30cm` y `gonmore14/web-3m30cm`
- Servidor remoto: acceso por SSH
- Ruta remota del proyecto: `~/app-server/proyectos/3m30cm`
- Red Docker externa por defecto: `red-interna`

### Contenedores de produccion

- `api-3m30cm`: publica `4100:4100`
- `web-3m30cm`: publica `4173:80`
- `api-migrate`: contenedor efimero para `prisma:push`
- `api-seed`: contenedor efimero para seed opcional

### Dependencias externas en produccion

La API no levanta su propia base ni su propio MinIO en `docker-compose.prod.yml`. En produccion se conecta a servicios ya existentes dentro de la red Docker externa definida en el servidor.

Eso evita duplicar infraestructura en cada proyecto y permite compartir Postgres, MinIO y reverse proxy entre stacks distintos.

## 3. Filosofia de entorno

### Mismo shape de `.env`

La leccion importante es que local y produccion deben tener el mismo shape de variables aunque cambien los valores.

Eso significa:

- mismas keys
- mismos nombres para secretos y endpoints
- overrides minimos por ambiente

Con eso el codigo no tiene que cambiar cuando se despliega.

### Web en mismo origen

La web usa `/api/*` relativo por defecto.

En local:

- Vite recibe la request.
- Vite proxy reenvia a `API_PROXY_TARGET`.

En produccion:

- nginx dentro del contenedor web recibe `/api/*`.
- nginx reenvia a `api-3m30cm:4100` dentro de la red Docker.

Consecuencia: ya no hace falta reconstruir la web con una URL distinta del API para cada release.

### Mobile con switch explicito

En Expo no se depende del `.env` raiz para alternar entre local y produccion. Los scripts lo fuerzan.

Eso elimina el error mas comun: creer que Expo esta leyendo una variable que en realidad no cargo porque se esta ejecutando desde `apps/mobile` o `apps/mobile2`.

## 4. Docker local

### Que corre en Docker local

Para desarrollo local, Docker se usa solo para backend y frontend web.

Se levanta con:

```bash
docker compose -f docker-compose.local.yml up --build
```

Eso arranca el flujo local del proyecto sobre la red `red-desarrollo`.

### Que no corre en Docker local

- `apps/mobile`
- `apps/mobile2`

Las apps Expo corren desde el host porque Metro, Expo Go y el acceso a simuladores/dispositivos funcionan mejor fuera de contenedores.

### Prerrequisitos locales

Antes de levantar el compose local deben existir servicios base en `red-desarrollo`, especialmente:

- `postgres-local`
- `minio-local`

La API local apunta a esos servicios por nombre de red, no por `localhost` dentro del contenedor.

### Puertos locales esperados

- API: `http://localhost:4100`
- Web admin: `http://localhost:4173`
- Mobile Expo: `8081`
- Mobile2 Expo: `8082`

## 5. Flujo de deploy a produccion

### Script unico

El deploy se hace con:

```bash
./deploy.sh
```

El script hoy hace exactamente esto:

1. genera un tag de version `YYYYMMDDHHMM`
2. construye la imagen de la API con `apps/api/Dockerfile.prod`
3. hace push de la API a Docker Hub
4. construye la imagen web con `apps/web/Dockerfile.prod`
5. hace push de la web a Docker Hub
6. abre una sesion SSH al servidor
7. escribe `.env.version` con `APP_VERSION=<tag>`
8. valida que exista `.env` remoto
9. valida que exista `docker-compose.prod.yml` remoto
10. valida que exista la red Docker externa (`DOCKER_EXTERNAL_NETWORK`, default `red-interna`)
11. ejecuta `docker compose pull`
12. ejecuta `api-migrate` para `prisma:push`
13. ejecuta `docker compose up -d`
14. ejecuta `api-seed` solo si `RUN_SEED_ON_DEPLOY=1`
15. hace `docker image prune -f`

### Cosas importantes del deploy actual

- El frontend web no recibe `VITE_API_BASE_URL` como `build-arg` en produccion.
- La API y la web se etiquetan con la misma version temporal.
- El script mide tiempos de build, push y tareas remotas para detectar cuellos de botella.
- El `seed` no corre siempre; queda controlado por variable remota.

### Requisitos minimos del servidor remoto

- Docker disponible
- Docker Compose disponible
- acceso SSH
- directorio del proyecto ya creado
- archivo `.env` remoto correcto
- `docker-compose.prod.yml` remoto presente
- red Docker externa existente

## 6. Apps Expo: dev vs prod

### Principio

En este proyecto `dev` significa backend local y `prod` significa backend publico.

No se cambia `.env` para alternar. Se cambia el comando.

### Mobile principal

```bash
npm --prefix apps/mobile run dev
npm --prefix apps/mobile run prod

npm --prefix apps/mobile run android
npm --prefix apps/mobile run android:prod

npm --prefix apps/mobile run ios
npm --prefix apps/mobile run ios:prod

npm --prefix apps/mobile run web
npm --prefix apps/mobile run web:prod
```

### Mobile2

```bash
npm --prefix apps/mobile2 run dev
npm --prefix apps/mobile2 run prod

npm --prefix apps/mobile2 run android
npm --prefix apps/mobile2 run android:prod

npm --prefix apps/mobile2 run ios
npm --prefix apps/mobile2 run ios:prod

npm --prefix apps/mobile2 run web
npm --prefix apps/mobile2 run web:prod
```

### Como funciona tecnicamente

- Se usa `cross-env` para que el comportamiento sea igual en Windows.
- En `dev`, `EXPO_PUBLIC_API_BASE_URL` se deja vacia a proposito.
- En `prod`, `EXPO_PUBLIC_API_BASE_URL` se fija a `https://3m30cm.supernovatel.com`.
- `mobile` usa puerto `8081`.
- `mobile2` usa puerto `8082` y `--clear`.

### Por que se hace asi

Porque Expo ejecutado desde subcarpetas no siempre toma automaticamente el `.env` raiz. Si el cambio de ambiente depende de eso, el equipo termina con errores del tipo `Network request failed` y no queda claro si esta hablando con local o con produccion.

Forzarlo en los scripts hace el comportamiento obvio y repetible.

## 7. Convenciones que conviene repetir en el siguiente proyecto

Si el siguiente proyecto tambien va a vivir dentro de Supernovatel, este es el checklist recomendado:

### Estructura de red e infraestructura

1. Mantener una red Docker externa comun para servicios compartidos.
2. Conectar cada stack nuevo a esa red usando `DOCKER_EXTERNAL_NETWORK`.
3. Dejar Postgres, MinIO y otros servicios base fuera del compose del proyecto si son compartidos.

### Frontend web

1. Diseñar la web para consumir `/api/*` relativo por defecto.
2. Usar proxy en local y reverse proxy en produccion.
3. Evitar build args especificos de ambiente salvo que sean inevitables.

### Dockerfiles

1. Usar Dockerfiles de produccion separados.
2. Instalar solo las dependencias del workspace que realmente construyes.
3. Agregar `.dockerignore` desde el inicio para evitar contextos gigantes.

### Deploy

1. Centralizar todo en `deploy.sh`.
2. Versionar imagenes por timestamp o version explicita.
3. Validar precondiciones remotas antes de hacer `up -d`.
4. Separar migraciones y seed en servicios tools o jobs dedicados.

### Expo

1. Definir `dev` y `prod` como scripts separados desde el inicio.
2. No depender del `.env` raiz como unico mecanismo de cambio de backend.
3. Reservar puertos fijos por app Expo.

## 8. Lo que haria igual otra vez

- mismo origen web con `/api`
- deploy por Docker Hub + SSH
- `api-migrate` y `api-seed` separados del servicio principal
- network externa configurable
- scripts Expo `dev` y `prod`
- documentacion operativa en la raiz del repo

## 9. Lo que no conviene olvidar

- verificar el nombre real de la red Docker del servidor antes del primer deploy
- dejar listo `.dockerignore` antes de que el repo crezca
- documentar la ruta remota exacta del proyecto
- dejar claro si MinIO y Postgres son propios del proyecto o compartidos
- definir desde el arranque si la web va por mismo origen o por dominio separado
- validar los scripts Expo en Windows, no solo en macOS/Linux

## 10. Resumen corto reutilizable

Si en el proximo proyecto quieres repetir este patron, la receta base es:

1. monorepo con `apps/api`, `apps/web`, `apps/mobile` y opcionalmente otra app Expo
2. web consumiendo `/api/*` relativo
3. backend y web dockerizados para local y produccion
4. deploy centralizado en `deploy.sh`
5. variables de entorno con mismo shape entre local y prod
6. apps Expo con comandos `dev` y `prod` separados
7. documentacion operativa escrita desde el inicio

Si esto se mantiene, el siguiente proyecto deberia poder quedar listo para operar mucho antes y con menos cambios manuales entre ambientes.