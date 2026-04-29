#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/.."
ENV_FILE="$DEPLOY_DIR/.env.default"
LOCAL_FRONTEND_ASSET_SCRIPT="$SCRIPT_DIR/build-local-frontend-assets.sh"
INIT_KONG_SCRIPT="$SCRIPT_DIR/init/init-kong-property.sh"

if [ -f "$DEPLOY_DIR/.env" ]; then
  ENV_FILE="$DEPLOY_DIR/.env"
fi

source "$ENV_FILE"

if [ -f "$DEPLOY_DIR/.env.tmp" ]; then
  source "$DEPLOY_DIR/.env.tmp"
fi

COMPOSE_ARGS=(
  --env-file "$ENV_FILE"
  --project-name tier0
  -f "$DEPLOY_DIR/docker-compose.yml"
  -f "$DEPLOY_DIR/docker-compose.local-frontend.yml"
)

if [ -f "$DEPLOY_DIR/.env.tmp" ]; then
  COMPOSE_ARGS=(--env-file "$ENV_FILE" --env-file "$DEPLOY_DIR/.env.tmp" "${COMPOSE_ARGS[@]:2}")
fi

echo "Building local frontend artifacts..."
bash "$LOCAL_FRONTEND_ASSET_SCRIPT"

mkdir -p "$DEPLOY_DIR/../frontend/apps/services-express/.runtime/app-marketplace"

echo "Rendering Kong config for local frontend APIs..."
bash "$INIT_KONG_SCRIPT" "$DEPLOY_DIR"

if [ -n "$VOLUMES_PATH" ]; then
  mkdir -p "$VOLUMES_PATH/kong"
  cp "$DEPLOY_DIR/mount/kong/kong_config.yml" "$VOLUMES_PATH/kong/kong_config.yml"
fi

docker compose "${COMPOSE_ARGS[@]}" up -d --build frontend

if docker ps --format '{{.Names}}' | grep -qx 'kong'; then
  echo "Reloading Kong routes..."
  docker exec kong kong config db_import /etc/kong/kong_config.yml >/dev/null
  docker exec kong kong reload >/dev/null
fi

echo
echo "Local frontend image rebuilt and started."
echo "Use the normal Tier0入口访问:"
echo "  ${BASE_URL:-Check deploy/.env.tmp for BASE_URL}/uns"
