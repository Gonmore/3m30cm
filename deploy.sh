#!/bin/bash
set -euo pipefail

# --- CONFIGURACIÓN ---
USER_DOCKER="gonmore14"
SERVER_USER="home"
SERVER_IP="192.168.10.57"
SERVER_PATH="~/app-server/proyectos/3m30cm"
PROD_URL="https://3m30cm.supernovatel.com"
VERSION=$(date +%Y%m%d%H%M)

format_elapsed() {
  local elapsed=$1
  printf "%dm %02ds" $((elapsed / 60)) $((elapsed % 60))
}

TOTAL_STARTED=$SECONDS

echo "🏗️  1. Iniciando construcción de versión: $VERSION"

# Build & Push Backend
STEP_STARTED=$SECONDS
docker build -t $USER_DOCKER/api-3m30cm:$VERSION \
  -f apps/api/Dockerfile.prod \
  .
echo "⏱️  Build API local: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

STEP_STARTED=$SECONDS
docker push $USER_DOCKER/api-3m30cm:$VERSION
echo "⏱️  Push API Docker Hub: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

# Build & Push Web
STEP_STARTED=$SECONDS
docker build -t $USER_DOCKER/web-3m30cm:$VERSION \
  -f apps/web/Dockerfile.prod \
  .
echo "⏱️  Build Web local: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

STEP_STARTED=$SECONDS
docker push $USER_DOCKER/web-3m30cm:$VERSION
echo "⏱️  Push Web Docker Hub: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

echo "🚀 2. Actualizando servidor remoto..."

STEP_STARTED=$SECONDS
ssh "$SERVER_USER@$SERVER_IP" "SERVER_PATH=$SERVER_PATH VERSION=$VERSION bash -s" << 'EOF'
  set -e

  format_elapsed() {
    local elapsed=$1
    printf "%dm %02ds" $((elapsed / 60)) $((elapsed % 60))
  }

  REMOTE_TOTAL_STARTED=$SECONDS
  cd "$SERVER_PATH"

  if [ ! -f .env ]; then
    echo "❌ Falta .env en $SERVER_PATH" >&2
    exit 1
  fi

  if [ ! -f docker-compose.prod.yml ]; then
    echo "❌ Falta docker-compose.prod.yml en $SERVER_PATH" >&2
    exit 1
  fi

  # NO "source" .env: docker env-files permiten espacios sin quotes
  # que rompen el parser de shell. Solo leemos RUN_SEED_ON_DEPLOY de forma segura.
  RUN_SEED_ON_DEPLOY=0
  if [ -f .env ]; then
    value=$(grep -E '^RUN_SEED_ON_DEPLOY=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')
    if [ -n "${value:-}" ]; then
      RUN_SEED_ON_DEPLOY="$value"
    fi
  fi

  # Creamos o sobreescribimos el archivo de versión
  echo "APP_VERSION=$VERSION" > .env.version

  DOCKER_EXTERNAL_NETWORK=red-interna
  if [ -f .env ]; then
    value=$(grep -E '^DOCKER_EXTERNAL_NETWORK=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')
    if [ -n "${value:-}" ]; then
      DOCKER_EXTERNAL_NETWORK="$value"
    fi
  fi

  if ! docker network inspect "$DOCKER_EXTERNAL_NETWORK" >/dev/null 2>&1; then
    echo "❌ Falta la red Docker externa '$DOCKER_EXTERNAL_NETWORK' en el servidor" >&2
    exit 1
  fi

  COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env --env-file .env.version)

  echo "📥 Descargando nuevas imágenes ($VERSION)..."
  STEP_STARTED=$SECONDS
  "${COMPOSE[@]}" pull
  echo "⏱️  Pull remoto: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

  echo "🗄️  Aplicando schema Prisma (db push)..."
  STEP_STARTED=$SECONDS
  "${COMPOSE[@]}" --profile tools run --rm api-migrate </dev/null
  echo "⏱️  Prisma db push remoto: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

  echo "🔄 Reiniciando contenedores..."
  STEP_STARTED=$SECONDS
  "${COMPOSE[@]}" up -d
  echo "⏱️  Compose up remoto: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

  if [ "${RUN_SEED_ON_DEPLOY:-0}" = "1" ] || [ "${RUN_SEED_ON_DEPLOY:-0}" = "true" ] || [ "${RUN_SEED_ON_DEPLOY:-0}" = "TRUE" ]; then
    echo "🌱 Ejecutando seed (tools profile)..."
    STEP_STARTED=$SECONDS
    "${COMPOSE[@]}" --profile tools run --rm api-seed </dev/null
    echo "⏱️  Seed remoto: $(format_elapsed "$((SECONDS - STEP_STARTED))")"
  else
    echo "🌱 Seed omitido (set RUN_SEED_ON_DEPLOY=1 para ejecutarlo)"
  fi

  echo "🧹 Limpiando imágenes antiguas..."
  STEP_STARTED=$SECONDS
  docker image prune -f
  echo "⏱️  Prune remoto: $(format_elapsed "$((SECONDS - STEP_STARTED))")"
  echo "⏱️  Total remoto: $(format_elapsed "$((SECONDS - REMOTE_TOTAL_STARTED))")"
EOF
echo "⏱️  Sesión SSH remota: $(format_elapsed "$((SECONDS - STEP_STARTED))")"

echo "✅ 3. Despliegue exitoso de la versión $VERSION"
echo "⏱️  Total deploy: $(format_elapsed "$SECONDS")"
echo "   → $PROD_URL"
echo "   → $PROD_URL/api/v1/health"
