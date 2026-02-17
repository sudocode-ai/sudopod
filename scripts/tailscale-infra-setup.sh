#!/usr/bin/env bash
#
# Tailscale test infrastructure setup/teardown.
#
# Brings up Headscale (Docker), ngrok tunnel, and a Docker Tailscale client
# for the codespaces E2E test. Run this manually to pre-provision infrastructure
# so the test skips the slow infra setup in beforeAll().
#
# Usage:
#   ./scripts/tailscale-infra-setup.sh up     # Start everything (default)
#   ./scripts/tailscale-infra-setup.sh down    # Tear everything down
#
# Prerequisites:
#   - Docker running
#   - ngrok installed and authenticated (ngrok config add-authtoken <token>)
#
# After 'up', source the generated env file to run the E2E test:
#   source .env.tailscale-test
#   RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/codespaces/e2e.test.ts \
#     --config vitest.integration.codespaces.config.ts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/tests/integration/tailscale/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/.env.tailscale-test"
HEADSCALE_URL="http://localhost:8080"

# ── Helpers ──

log()  { echo "  [tailscale-infra] $*"; }
fail() { echo "  [tailscale-infra] ERROR: $*" >&2; exit 1; }

wait_for_health() {
  local url="$1" max_attempts="${2:-30}"
  for i in $(seq 1 "$max_attempts"); do
    if curl -sf "$url/health" 2>/dev/null | grep -q '"pass"'; then
      return 0
    fi
    sleep 1
  done
  fail "Headscale did not become healthy after ${max_attempts}s"
}

# ── Down ──

do_down() {
  log "Stopping ngrok..."
  pkill -f "ngrok http 8080" 2>/dev/null || true

  log "Stopping Docker Compose (Headscale + Tailscale client)..."
  docker compose -f "$COMPOSE_FILE" --profile connectivity down -v 2>/dev/null || true

  rm -f "$ENV_FILE"
  log "Done."
}

# ── Up ──

do_up() {
  # Clean slate
  log "Cleaning up any leftover state..."
  docker compose -f "$COMPOSE_FILE" --profile connectivity down -v 2>/dev/null || true
  pkill -f "ngrok http 8080" 2>/dev/null || true
  sleep 2

  # 1. Start Headscale
  log "Starting Headscale..."
  docker compose -f "$COMPOSE_FILE" up -d headscale

  log "Waiting for Headscale health..."
  wait_for_health "$HEADSCALE_URL"
  log "Headscale healthy."

  # 2. Create API key (retry for gRPC readiness)
  log "Creating Headscale API key..."
  local api_key=""
  for i in $(seq 1 10); do
    api_key=$(docker compose -f "$COMPOSE_FILE" exec -T headscale headscale apikeys create -e 1h 2>/dev/null) && break
    log "  Attempt $i failed, retrying..."
    sleep 3
  done
  [ -n "$api_key" ] || fail "Failed to create Headscale API key"
  log "API key: ${api_key:0:12}..."

  # 3. Create user + preauthkeys via REST API
  local user_name="test-e2e-$(date +%s)"
  log "Creating Headscale user: $user_name"

  local user_json
  user_json=$(curl -sf -X POST "$HEADSCALE_URL/api/v1/user" \
    -H "Authorization: Bearer $api_key" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$user_name\"}")

  local user_id
  user_id=$(echo "$user_json" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$user_id" ] || fail "Failed to create user"
  log "User ID: $user_id"

  # Docker preauthkey
  local docker_key_json
  docker_key_json=$(curl -sf -X POST "$HEADSCALE_URL/api/v1/preauthkey" \
    -H "Authorization: Bearer $api_key" \
    -H "Content-Type: application/json" \
    -d "{\"user\": \"$user_id\", \"reusable\": false, \"expiration\": \"$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\"}")
  local docker_preauthkey
  docker_preauthkey=$(echo "$docker_key_json" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$docker_preauthkey" ] || fail "Failed to create Docker preauthkey"
  log "Docker preauthkey: ${docker_preauthkey:0:12}..."

  # Codespace preauthkey
  local cs_key_json
  cs_key_json=$(curl -sf -X POST "$HEADSCALE_URL/api/v1/preauthkey" \
    -H "Authorization: Bearer $api_key" \
    -H "Content-Type: application/json" \
    -d "{\"user\": \"$user_id\", \"reusable\": false, \"expiration\": \"$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\"}")
  local cs_preauthkey
  cs_preauthkey=$(echo "$cs_key_json" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$cs_preauthkey" ] || fail "Failed to create Codespace preauthkey"
  log "Codespace preauthkey: ${cs_preauthkey:0:12}..."

  # 4. Start ngrok tunnel
  log "Starting ngrok tunnel to port 8080..."
  ngrok http 8080 > /dev/null 2>&1 &
  local ngrok_pid=$!

  local ngrok_url=""
  for i in $(seq 1 30); do
    ngrok_url=$(curl -sf http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4) && break
    sleep 1
  done
  [ -n "$ngrok_url" ] || fail "ngrok did not provide a public URL"
  log "ngrok URL: $ngrok_url"

  # 5. Start Docker Tailscale container
  log "Starting Docker Tailscale container..."
  TS_AUTHKEY="$docker_preauthkey" TS_LOGIN_SERVER="$ngrok_url" \
    docker compose -f "$COMPOSE_FILE" --profile connectivity up -d tailscale-client

  # 6. Wait for Docker node to join tailnet
  log "Waiting for Docker Tailscale node to join tailnet..."
  local docker_ip=""
  for i in $(seq 1 30); do
    local nodes_json
    nodes_json=$(curl -sf "$HEADSCALE_URL/api/v1/node" \
      -H "Authorization: Bearer $api_key" 2>/dev/null || echo '{"nodes":[]}')
    # Look for docker-local node that's online
    if echo "$nodes_json" | grep -q '"online":true'; then
      docker_ip=$(echo "$nodes_json" | grep -o '"ipAddresses":\["[^"]*"' | head -1 | cut -d'"' -f4)
      [ -n "$docker_ip" ] && break
    fi
    sleep 2
  done
  [ -n "$docker_ip" ] || fail "Docker Tailscale node did not come online"
  log "Docker node online: $docker_ip"

  # 7. Write env file
  cat > "$ENV_FILE" <<EOF
# Generated by scripts/tailscale-infra-setup.sh — $(date)
# Source this file before running the codespaces E2E test.
export HEADSCALE_API_KEY="$api_key"
export HEADSCALE_URL="$HEADSCALE_URL"
export NGROK_URL="$ngrok_url"
export DOCKER_PREAUTHKEY="$docker_preauthkey"
export CODESPACE_PREAUTHKEY="$cs_preauthkey"
export DOCKER_TAILSCALE_IP="$docker_ip"
EOF

  log ""
  log "Infrastructure ready. To run the E2E test:"
  log ""
  log "  source $ENV_FILE"
  log "  RUN_INTEGRATION_TESTS=1 npx vitest run tests/integration/provider/codespaces/e2e.test.ts \\"
  log "    --config vitest.integration.codespaces.config.ts"
  log ""
  log "To tear down: ./scripts/tailscale-infra-setup.sh down"
}

# ── Main ──

case "${1:-up}" in
  up)   do_up   ;;
  down) do_down ;;
  *)    echo "Usage: $0 [up|down]"; exit 1 ;;
esac
