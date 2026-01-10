#!/bin/bash -l
# Test daemon that SSH's to itself to keep codespace alive
# Testing if periodic SSH commands register as active sessions
# MUST run as login shell to have access to gh CLI

DAEMON_PID_FILE="/tmp/keepalive-daemon.pid"
DAEMON_LOG_FILE="/tmp/keepalive-daemon.log"
KEEPALIVE_SECONDS=3600  # 1 hour (60 minutes)
HEARTBEAT_INTERVAL_SECONDS=60  # 1 minute
CODESPACE_NAME="${1:-}"  # Codespace name passed as argument

# Logging function
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$DAEMON_LOG_FILE"
}

# Write PID file
echo $$ > "$DAEMON_PID_FILE"
log "Daemon started with PID $$"
log "Keepalive duration: ${KEEPALIVE_SECONDS}s, Interval: ${HEARTBEAT_INTERVAL_SECONDS}s"
log "Codespace name: $CODESPACE_NAME"

# Record start time
start_time=$(date +%s)

# Main loop: SSH to ourselves every minute
log "Entering main loop - will SSH to self every ${HEARTBEAT_INTERVAL_SECONDS}s"
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))
  
  # Check if we've exceeded keepalive duration
  if [ "$elapsed" -ge "$KEEPALIVE_SECONDS" ]; then
    log "Keepalive duration exceeded (${elapsed}s), stopping daemon"
    break
  fi
  
  # SSH to ourselves and run a simple echo command
  log "Running SSH keepalive command (elapsed: ${elapsed}s / ${KEEPALIVE_SECONDS}s)"
  ssh_output=$(gh codespace ssh -c "$CODESPACE_NAME" -- 'echo "keepalive ping"' 2>&1)
  ssh_result=$?
  
  log "SSH exit code: $ssh_result, output: $ssh_output"
  
  # Sleep until next interval
  sleep "$HEARTBEAT_INTERVAL_SECONDS"
done

log "Daemon stopping, removing PID file"
rm -f "$DAEMON_PID_FILE"
