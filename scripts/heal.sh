#!/usr/bin/env bash
# Recover after Mac sleep / Podman VM pause (observed Phase 03): the VM clock falls
# behind, then jumps; Vault (wall clock) expires leases while Vault Agent's monotonic
# renewal timer has not fired, leaving the API with dead DB credentials.
#   heal.sh clock   -> check VM vs host clock; restart chronyd in the VM if drift > 2 s
#   heal.sh all     -> clock, unseal Vault if sealed, re-render credentials if API not ready
set -uo pipefail
PODMAN="${PODMAN:-podman}"
here="$(cd "$(dirname "$0")" && pwd)"

drift() {
  local h v
  h="$(date -u +%s)"
  v="$("$PODMAN" machine ssh date -u +%s 2>/dev/null)" || return 1
  echo $((h - v))
}

clock() {
  local d
  d="$(drift)" || {
    echo 'BLOCKED: cannot reach the Podman VM' >&2
    return 2
  }
  if ((d > 2 || d < -2)); then
    # makestep alone is not enough when chrony is anchored on a stale source (Phase 03).
    echo "VM clock drift ${d}s: restarting chronyd in the Podman VM"
    "$PODMAN" machine ssh 'sudo systemctl restart chronyd && sleep 15 && sudo chronyc makestep >/dev/null' 2>/dev/null
    d="$(drift)"
  fi
  if ((d > 2 || d < -2)); then
    echo "CLOCK_FAIL drift=${d}s" >&2
    return 1
  fi
  echo "CLOCK_OK drift=${d}s"
}

ready() { [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8470/api/health/ready)" == 200 ]]; }

case "${1:-all}" in
clock) clock ;;
all)
  clock || exit $?
  bash "$here/vault.sh" unseal
  if "$PODMAN" container exists fray-api && ! ready; then
    echo 'API not ready: restarting fray-vault-agent to re-authenticate and re-render credentials'
    "$PODMAN" restart -t 5 fray-vault-agent >/dev/null
    for _ in $(seq 45); do
      ready && break
      sleep 1
    done
  fi
  if "$PODMAN" container exists fray-api; then
    if ready; then
      echo 'HEAL_OK: API ready'
    else
      echo 'HEAL_FAIL: API still not ready (make logs SERVICE=api)' >&2
      exit 1
    fi
  elif [[ -f "${FRAY_CONFIG_DIR:-$HOME/.config/f-ray-grance}/vault-configured" ]]; then
    echo 'HEAL_FAIL: fray-api is expected (Vault configured) but not provisioned: run make provision' >&2
    exit 1
  else
    echo 'HEAL_OK (API not provisioned yet)'
  fi
  ;;
*)
  echo 'usage: heal.sh clock|all' >&2
  exit 2
  ;;
esac
