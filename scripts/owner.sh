#!/usr/bin/env bash
# Owner account administration through fray-api's CLI. Passwords are read with
# echo disabled and passed on stdin only (never argv/env/logs). A non-interactive
# caller may pipe the password via FRAY_OWNER_PASSWORD_STDIN=1.
set -euo pipefail
PODMAN="${PODMAN:-podman}"
cmd="${1:?}"
user="${2:-}"
display="${3:-}"
[[ -n "$user" ]] || {
  echo 'USERNAME=<name> is required' >&2
  exit 2
}
"$PODMAN" container exists fray-api || {
  echo 'BLOCKED: fray-api is not provisioned (run make up)' >&2
  exit 2
}
run() { "$PODMAN" exec -i fray-api node apps/api/dist/cli/owner.js "$@"; }
case "$cmd" in
create | reset-password)
  if [[ "${FRAY_OWNER_PASSWORD_STDIN:-}" == 1 ]]; then
    IFS= read -r pw
  else
    IFS= read -r -s -p 'New password (min 12 chars): ' pw
    echo
    IFS= read -r -s -p 'Repeat password: ' pw2
    echo
    [[ "$pw" == "$pw2" ]] || {
      echo 'Passwords do not match' >&2
      exit 2
    }
  fi
  if [[ "$cmd" == create ]]; then
    printf '%s' "$pw" | run create "$user" ${display:+"$display"}
  else
    printf '%s' "$pw" | run reset-password "$user"
  fi
  ;;
revoke-sessions) run revoke-sessions "$user" ;;
*)
  echo 'usage: owner.sh create|reset-password|revoke-sessions <username> [display]' >&2
  exit 2
  ;;
esac
