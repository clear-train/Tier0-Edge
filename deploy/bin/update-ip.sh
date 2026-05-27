#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$SCRIPT_DIR/.."
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
ENV_DEFAULT_FILE="$DEPLOY_DIR/.env.default"

usage() {
  cat <<'USAGE'
Usage:
  bash deploy/bin/update-ip.sh <new-ip-or-host> [options]
  bash deploy/bin/update-ip.sh --auto [options]

Options:
  --auto                  Detect host IP automatically.
  --no-frontend           Do not rebuild/recreate the frontend container.
  --no-runtime            Do not update App Marketplace runtime metadata.
  --no-nodered            Do not update Node-RED MQTT broker references.
  --no-nodered-restart    Update Node-RED flow file but do not restart Node-RED.
  --rewrite-private-brokers
                          Also rewrite other private-IP MQTT brokers in Node-RED.
  --help                  Show this help.

What this script does:
  1. Updates deploy/.env ENTRANCE_DOMAIN.
  2. Regenerates deploy/.env.tmp BASE_URL.
  3. Runs the existing deploy/bin/util/changeIp.sh for Kong/Keycloak/UNS.
  4. Rebuilds/recreates the local frontend when LOCAL_FRONTEND=true.
  5. Updates App Marketplace runtime launch URLs.
  6. Updates Node-RED MQTT broker nodes that still point at the old host.

Recommended:
  bash deploy/bin/update-ip.sh 192.168.0.100
USAGE
}

log() {
  printf '[update-ip] %s\n' "$*"
}

warn() {
  printf '[update-ip][warn] %s\n' "$*" >&2
}

fail() {
  printf '[update-ip][error] %s\n' "$*" >&2
  exit 1
}

detect_host_ip() {
  local detected=""
  if command -v ipconfig >/dev/null 2>&1; then
    detected="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [ -n "$detected" ]; then
      printf '%s\n' "$detected"
      return
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' || true
    return
  fi
}

validate_host() {
  local host="$1"
  if [ -z "$host" ]; then
    fail "New IP/host is empty."
  fi

  if [[ "$host" == "localhost" || "$host" == "127."* ]]; then
    fail "Do not use localhost or 127.x.x.x for Tier0 OAuth. Use the LAN IP instead."
  fi

  if [[ ! "$host" =~ ^[A-Za-z0-9.-]+$ ]]; then
    fail "Invalid host [$host]. Use an IP address or DNS host."
  fi
}

ensure_env_file() {
  if [ -f "$ENV_FILE" ]; then
    return
  fi

  if [ -f "$ENV_DEFAULT_FILE" ]; then
    warn "deploy/.env was missing; creating it from deploy/.env.default."
    cp "$ENV_DEFAULT_FILE" "$ENV_FILE"
    return
  fi

  fail "Cannot find deploy/.env or deploy/.env.default."
}

read_env_value() {
  local key="$1"
  local file="$2"
  awk -F= -v key="$key" '$1 == key {print substr($0, length(key) + 2)}' "$file" | tail -n 1
}

update_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp="${file}.tmp.$$"

  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

source_env() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

get_active_profile_args() {
  local active_file="${VOLUMES_PATH:-}/edge/system/active-services.txt"
  if [ -n "${VOLUMES_PATH:-}" ] && [ -f "$active_file" ]; then
    sed -n '2p' "$active_file"
  fi
}

regenerate_tmp_env() {
  local active_profile_args="$1"
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/util/set-temp-env.sh" "$DEPLOY_DIR" "$active_profile_args"
  # shellcheck disable=SC1090
  source "$DEPLOY_DIR/.env.tmp"
}

container_exists() {
  local name="$1"
  docker ps -a --format '{{.Names}}' | grep -qx "$name"
}

container_running() {
  local name="$1"
  docker ps --format '{{.Names}}' | grep -qx "$name"
}

update_marketplace_runtime() {
  local old_host="$1"
  local new_host="$2"
  local runtime_dir="$PROJECT_ROOT/frontend/apps/services-express/.runtime/app-marketplace"

  if [ ! -d "$runtime_dir" ]; then
    log "App Marketplace runtime directory not found; skipping runtime metadata."
    return
  fi

  log "Updating App Marketplace runtime metadata..."

  find "$runtime_dir" -type f \( -name 'deployment.json' -o -name '*sync.json' -o -name 'docker-compose.generated.yml' \) | while read -r file; do
    if [ -n "$old_host" ] && [ "$old_host" != "$new_host" ]; then
      OLD_HOST="$old_host" NEW_HOST="$new_host" perl -0pi -e 's/\Q$ENV{OLD_HOST}\E/$ENV{NEW_HOST}/g' "$file"
    fi
  done

  find "$runtime_dir" -type f -name 'deployment.json' | while read -r file; do
    node - "$file" "$new_host" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const host = process.argv[3];

let record;
try {
  record = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  process.exit(0);
}

if (record && typeof record.launchUrl === 'string' && record.launchUrl) {
  try {
    const url = new URL(record.launchUrl);
    url.hostname = host;
    record.launchUrl = url.toString().replace(/\/$/, '');
  } catch {}
}

fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
NODE
  done
}

update_nodered_flows() {
  local old_host="$1"
  local new_host="$2"
  local restart_nodered="$3"
  local rewrite_private_brokers="$4"
  local flows_file="${VOLUMES_PATH:-}/node-red/flows.json"

  if [ -z "${VOLUMES_PATH:-}" ] || [ ! -f "$flows_file" ]; then
    log "Node-RED flows.json not found; skipping Node-RED broker update."
    return
  fi

  local backup_file="${flows_file}.bak.$(date +%Y%m%d%H%M%S)"

  local changed
  changed="$(node - "$flows_file" "$backup_file" "$old_host" "$new_host" "$rewrite_private_brokers" <<'NODE'
const fs = require('fs');
const [file, backup, oldHost, newHost, rewritePrivateBrokers] = process.argv.slice(2);

let flows;
try {
  flows = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`[update-ip][warn] Cannot parse Node-RED flows: ${error.message}`);
  process.exit(0);
}

let changed = 0;
for (const node of flows) {
  if (!node || node.type !== 'mqtt-broker' || typeof node.broker !== 'string') {
    continue;
  }

  if (oldHost && oldHost !== newHost && node.broker.includes(oldHost)) {
    node.broker = node.broker.split(oldHost).join(newHost);
    changed += 1;
    continue;
  }

  if (
    rewritePrivateBrokers === 'true' &&
    /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(node.broker) &&
    node.broker !== newHost
  ) {
    node.broker = newHost;
    changed += 1;
  }
}

if (changed > 0) {
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, `${JSON.stringify(flows, null, 2)}\n`);
}

console.log(changed);
NODE
)"

  if [ "${changed:-0}" -gt 0 ]; then
    log "Updated $changed Node-RED MQTT broker reference(s)."
    if [ "$restart_nodered" = "true" ] && container_exists nodered; then
      log "Restarting Node-RED..."
      docker restart nodered >/dev/null
    fi
  else
    log "No Node-RED MQTT broker reference needed updating."
  fi
}

rebuild_or_recreate_frontend() {
  local active_profile_args="$1"

  if [ "${LOCAL_FRONTEND:-false}" = "true" ] || [ "${LOCAL_FRONTEND:-false}" = "1" ]; then
    log "LOCAL_FRONTEND=true; rebuilding local frontend image..."
    bash "$SCRIPT_DIR/up-local-frontend.sh"
    return
  fi

  if ! container_exists frontend; then
    log "Frontend container does not exist; skipping frontend recreate."
    return
  fi

  log "Recreating frontend container with updated environment..."
  read -r -a compose_profile_args <<< "$active_profile_args"
  docker compose \
    --env-file "$ENV_FILE" \
    --env-file "$DEPLOY_DIR/.env.tmp" \
    --project-name tier0 \
    "${compose_profile_args[@]}" \
    -f "$DEPLOY_DIR/docker-compose.yml" \
    up -d frontend
}

verify_basic_urls() {
  local base_url="${BASE_URL:-}"
  if [ -z "$base_url" ]; then
    return
  fi

  log "Basic checks:"
  printf '  Tier0:   %s/uns\n' "$base_url"
  printf '  Login:   %s/tier0-login\n' "$base_url"
  printf '  NodeRED: %s/nodered/\n' "$base_url"
  printf '  OpenAPI: %s/open-api/health/server/detailed\n' "$base_url"
}

NEW_HOST=""
SKIP_FRONTEND=false
SKIP_RUNTIME=false
SKIP_NODERED=false
RESTART_NODERED=true
REWRITE_PRIVATE_BROKERS=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --auto)
      NEW_HOST="$(detect_host_ip)"
      shift
      ;;
    --no-frontend)
      SKIP_FRONTEND=true
      shift
      ;;
    --no-runtime)
      SKIP_RUNTIME=true
      shift
      ;;
    --no-nodered)
      SKIP_NODERED=true
      shift
      ;;
    --no-nodered-restart)
      RESTART_NODERED=false
      shift
      ;;
    --rewrite-private-brokers)
      REWRITE_PRIVATE_BROKERS=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      if [ -n "$NEW_HOST" ]; then
        fail "Only one new IP/host is supported."
      fi
      NEW_HOST="$1"
      shift
      ;;
  esac
done

validate_host "$NEW_HOST"
ensure_env_file

OLD_HOST="$(read_env_value ENTRANCE_DOMAIN "$ENV_FILE")"
log "Old host: ${OLD_HOST:-<empty>}"
log "New host: $NEW_HOST"

if [ "$OLD_HOST" = "$NEW_HOST" ]; then
  warn "deploy/.env already uses $NEW_HOST. The script will still refresh generated config and runtime state."
fi

update_env_value ENTRANCE_DOMAIN "$NEW_HOST" "$ENV_FILE"
source_env

ACTIVE_PROFILE_ARGS="$(get_active_profile_args)"
regenerate_tmp_env "$ACTIVE_PROFILE_ARGS"

if ! container_running postgresql; then
  fail "postgresql container is not running. Start Tier0 first with deploy/bin/install.sh, then rerun this script."
fi

log "Applying Kong/Keycloak/UNS IP migration through existing changeIp.sh..."
bash "$SCRIPT_DIR/util/changeIp.sh"

source_env
regenerate_tmp_env "$ACTIVE_PROFILE_ARGS"

if [ "$SKIP_RUNTIME" != "true" ]; then
  update_marketplace_runtime "$OLD_HOST" "$NEW_HOST"
fi

if [ "$SKIP_NODERED" != "true" ]; then
  update_nodered_flows "$OLD_HOST" "$NEW_HOST" "$RESTART_NODERED" "$REWRITE_PRIVATE_BROKERS"
fi

if [ "$SKIP_FRONTEND" != "true" ]; then
  rebuild_or_recreate_frontend "$ACTIVE_PROFILE_ARGS"
fi

verify_basic_urls
log "IP migration finished."
