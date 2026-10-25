#!/usr/bin/env bash
# Print a VERIFIED Podman API socket as unix://PATH, or fail closed.
# Honours an explicit PODMAN_DOCKER_HOST; otherwise asks the running Podman machine.
# Identity proof: /version must list a "Podman Engine" component (never Docker Desktop).
set -euo pipefail
host="${PODMAN_DOCKER_HOST:-}"
if [[ -z "$host" ]]; then
  path="$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null || true)"
  [[ -n "$path" ]] || {
    echo 'BLOCKED: no running Podman machine socket found' >&2
    exit 2
  }
  host="unix://$path"
fi
[[ "$host" == unix://* ]] || {
  echo 'BLOCKED: only local unix:// sockets are permitted' >&2
  exit 2
}
sock="${host#unix://}"
[[ -S "$sock" ]] || {
  echo "BLOCKED: $sock is not a socket" >&2
  exit 2
}
curl -sf --max-time 5 --unix-socket "$sock" http://d/version | grep -q '"Name":"Podman Engine"' ||
  {
    echo 'BLOCKED: socket does not identify as Podman Engine' >&2
    exit 2
  }
printf '%s\n' "$host"
