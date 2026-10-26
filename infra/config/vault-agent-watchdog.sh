#!/bin/sh
# fray-vault-agent supervisor: renews BEFORE expiry even across a Mac sleep.
#
# Vault Agent renews leases on its own timer, which runs on the guest's monotonic clock. When the
# Mac sleeps, the Podman VM pauses; on wake its wall clock lags (seen: 27 minutes) until chrony steps
# it forward. Vault runs in the same VM, so at that step it sees the 5-minute database lease as long
# expired and revokes it, while the agent still thinks renewal is minutes away. The API is then left
# with a dead login until the agent's next renewal attempt fails.
#
# This supervisor compares wall-clock progress with /proc/uptime (which does not jump) every 10 s.
# A jump of more than 30 s restarts the agent at once: it re-authenticates and renders fresh
# credentials within seconds, and the API swaps its pool when the file changes. It also restarts the
# agent if it exits for any other reason. Normal renewals are untouched.
set -u
CONFIG=/vault/agent/agent.hcl
THRESHOLD=${FRAY_CLOCK_JUMP_SECONDS:-30}

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [watchdog] $*"; }
uptime_s() { cut -d. -f1 /proc/uptime; }

child=0
stop() {
  [ "$child" -gt 0 ] && kill -TERM "$child" 2>/dev/null && wait "$child" 2>/dev/null
  exit 0
}
trap stop TERM INT

while :; do
  vault agent -config="$CONFIG" &
  child=$!
  log "agent started (pid $child)"
  wall=$(date +%s)
  up=$(uptime_s)
  while kill -0 "$child" 2>/dev/null; do
    sleep 10 &
    wait $! # interruptible, so TERM is handled promptly
    nwall=$(date +%s)
    nup=$(uptime_s)
    jump=$(((nwall - wall) - (nup - up)))
    wall=$nwall
    up=$nup
    if [ "${jump#-}" -gt "$THRESHOLD" ]; then
      log "wall clock jumped ${jump}s (VM resumed or clock stepped): re-authenticating for fresh credentials"
      kill -TERM "$child" 2>/dev/null
      wait "$child" 2>/dev/null
      break
    fi
  done
  wait "$child" 2>/dev/null
  log "agent stopped; restarting in 2 s"
  sleep 2
done
