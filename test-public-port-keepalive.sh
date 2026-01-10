#!/bin/bash
# Codespace SSH-to-self keepalive test
# Tests if periodic SSH commands keep the codespace alive

set -e

REPOSITORY="sudocode-ai/sudocode"
MACHINE="basicLinux32gb"

echo "=========================================="
echo "Codespace Keepalive Test (SSH to Self)"
echo "=========================================="
echo ""

# Step 1: Create fresh codespace
echo "Step 1: Creating fresh codespace..."
codespace_output=$(gh codespace create \
  --repo "$REPOSITORY" \
  --machine "$MACHINE" \
  --idle-timeout "5m" \
  --retention-period "0h" \
  --default-permissions 2>&1)

codespace_name=$(echo "$codespace_output" | tail -1 | xargs)

if [ -z "$codespace_name" ] || [[ ! "$codespace_name" =~ - ]]; then
  echo "ERROR: Failed to create codespace"
  echo "$codespace_output"
  exit 1
fi

echo "✓ Created codespace: $codespace_name"
echo ""

# Step 2: Wait for codespace to be ready
echo "Step 2: Waiting for codespace to be ready..."
max_wait=300
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  state=$(gh codespace list --json name,state | jq -r ".[] | select(.name == \"$codespace_name\") | .state")

  if [ "$state" = "Available" ]; then
    echo "✓ Codespace is ready"
    break
  fi

  echo "  Current state: $state (waiting...)"
  sleep 10
  elapsed=$((elapsed + 10))
done

if [ "$state" != "Available" ]; then
  echo "ERROR: Codespace did not become ready"
  exit 1
fi
echo ""

# Step 3: Upload and start daemon that SSH's to itself
echo "Step 3: Starting keepalive daemon (SSH to self)..."
echo "Codespace name: $codespace_name"
gh codespace ssh -c "$codespace_name" -- 'cat > /tmp/public-port-daemon.sh' < test-daemon-public-port.sh
gh codespace ssh -c "$codespace_name" -- chmod +x /tmp/public-port-daemon.sh
# Start daemon using bash -l to run in login shell (needed for gh CLI access)
# Pass codespace name as argument so daemon can SSH to itself
gh codespace ssh -c "$codespace_name" -- "bash -l -c 'nohup /tmp/public-port-daemon.sh \"$codespace_name\" >/tmp/public-daemon.log 2>&1 </dev/null &' &"
sleep 3
echo "✓ Daemon started"
echo ""

# Step 4: Verify daemon is running
echo "Step 4: Verifying daemon is running..."
gh codespace ssh -c "$codespace_name" -- 'cat /tmp/keepalive-daemon.pid && ps -p $(cat /tmp/keepalive-daemon.pid)'
echo "✓ Daemon process confirmed"
echo ""

# Step 5: Wait and verify first SSH keepalive
echo "Step 5: Waiting 65 seconds for first SSH keepalive..."
sleep 65
echo ""

echo "Daemon log:"
gh codespace ssh -c "$codespace_name" -- 'cat /tmp/keepalive-daemon.log 2>&1 || echo "(no log file found)"'
echo ""

# Step 6: Instructions for final test
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Codespace: $codespace_name"
echo "Idle timeout: 5 minutes"
echo ""
echo "The daemon is now SSH'ing to itself every minute to keep the codespace alive."
echo ""
echo "NEXT STEPS:"
echo "1. DO NOT RUN ANY MORE SSH COMMANDS"
echo "2. Wait 10 minutes (longer than the 5-minute idle timeout)"
echo "3. Check codespace status in GitHub UI:"
echo "   https://github.com/codespaces"
echo "4. If state is still 'Active', the test PASSED!"
echo "5. If state is 'Stopped', the test FAILED."
echo ""
echo "To check logs after waiting (this will resume the codespace if stopped):"
echo "  gh codespace ssh -c $codespace_name -- 'cat /tmp/keepalive-daemon.log'"
echo ""
