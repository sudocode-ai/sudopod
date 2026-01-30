/**
 * Codespaces Keepalive Script Generator
 *
 * Generates a bash daemon script that keeps a Codespace alive by making
 * periodic SSH connections when the sudocode server is active.
 *
 * Codespaces detects SSH activity as "active usage", preventing auto-stop.
 * The daemon checks the sudocode log file modification time to determine
 * if the workspace is actively being used.
 *
 * @see i-7pia - Port Codespaces keepalive daemon from deprecated code
 * @see s-84xz - Codespaces Provider Implementation specification
 */

/**
 * Generate a keepalive daemon bash script for a Codespace.
 *
 * The script runs inside the codespace as a background process.
 * It checks the sudocode server log file every 30 seconds. If the log
 * has been modified within the idle timeout window, it makes an SSH
 * ping to keep the codespace from auto-stopping.
 *
 * Uses cross-platform `stat` (GNU Linux vs BSD/macOS) for mtime checks.
 *
 * @param codespaceName - The codespace name (used in SSH keepalive pings)
 * @param port - Sudocode server port (used to find the log file)
 * @param idleTimeoutMinutes - Minutes of inactivity before allowing auto-stop
 * @returns The full bash script as a string
 */
export function generateKeepaliveScript(
  codespaceName: string,
  port: number,
  idleTimeoutMinutes: number
): string {
  return `#!/bin/bash
# Sudocode keepalive daemon for Codespaces
# Keeps the codespace alive while sudocode server is active.
LOG_FILE="/tmp/sudocode-${port}.log"
IDLE_TIMEOUT_SECONDS=$((${idleTimeoutMinutes} * 60))
CHECK_INTERVAL=30

while true; do
  sleep $CHECK_INTERVAL

  # Check log file mtime for recent activity
  if [ -f "$LOG_FILE" ]; then
    # Cross-platform stat: try GNU (Linux) first, fall back to BSD (macOS)
    LAST_MODIFIED=$(stat -c %Y "$LOG_FILE" 2>/dev/null || stat -f %m "$LOG_FILE")
    NOW=$(date +%s)
    IDLE_SECONDS=$((NOW - LAST_MODIFIED))

    if [ $IDLE_SECONDS -lt $IDLE_TIMEOUT_SECONDS ]; then
      # Active — ping to keep alive (SSH activity counts for Codespaces)
      gh codespace ssh -c ${codespaceName} -- echo "keepalive" > /dev/null 2>&1
    fi
  fi
done
`;
}
