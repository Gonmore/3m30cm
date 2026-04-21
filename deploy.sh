#!/bin/bash
set -euo pipefail

# --- CONFIGURACIÓN ---
USER_DOCKER="gonmore14"
SERVER_USER="home"
SERVER_IP="192.168.10.57"
SERVER_PATH="~/app-server/proyectos/3m30cm"
PROD_URL="https://3m30cm.supernovatel.com"
VERSION=$(date +%Y%m%d%H%M)

echo "🏗️  1. Iniciando construcción de versión: $VERSION"

# Build & Push Backend
docker build -t $USER_DOCKER/api-3m30cm:$VERSION \
  -f apps/api/Dockerfile.prod \
  .
docker push $USER_DOCKER/api-3m30cm:$VERSION

# Build & Push Web
docker build -t $USER_DOCKER/web-3m30cm:$VERSION \
  -f apps/web/Dockerfile.prod \
  .
docker push $USER_DOCKER/web-3m30cm:$VERSION

echo "🚀 2. Actualizando servidor remoto..."

ssh "$SERVER_USER@$SERVER_IP" "SERVER_PATH=$SERVER_PATH VERSION=$VERSION bash -s" << 'EOF'
  set -e
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
  "${COMPOSE[@]}" pull

  echo "🗄️  Aplicando schema Prisma (db push)..."
  "${COMPOSE[@]}" --profile tools run --rm api-migrate </dev/null

  echo "🔄 Reiniciando contenedores..."
  "${COMPOSE[@]}" up -d

  if [ "${RUN_SEED_ON_DEPLOY:-0}" = "1" ] || [ "${RUN_SEED_ON_DEPLOY:-0}" = "true" ] || [ "${RUN_SEED_ON_DEPLOY:-0}" = "TRUE" ]; then
    echo "🌱 Ejecutando seed (tools profile)..."
    "${COMPOSE[@]}" --profile tools run --rm api-seed </dev/null
  else
    echo "🌱 Seed omitido (set RUN_SEED_ON_DEPLOY=1 para ejecutarlo)"
  fi

  echo "🧹 Limpiando imágenes antiguas..."
  docker image prune -f
EOF

echo "✅ 3. Despliegue exitoso de la versión $VERSION"
echo "   → $PROD_URL"
echo "   → $PROD_URL/api/v1/health"
