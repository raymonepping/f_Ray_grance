#!/usr/bin/env bash
# F-Ray-grance read-only prerequisite inspection. Installs and modifies nothing.
set -euo pipefail

printf '\nF-Ray-grance prerequisite inspection\n\n'
missing=0
for tool in terraform ansible-playbook ansible-galaxy podman vault make curl python3 node npm openssl; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '  [OK]      %-20s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '  [MISSING] %s\n' "$tool"
    missing=1
  fi
done
# Optional for local operation; required for Phase 10 remote iPhone access.
if command -v tailscale >/dev/null 2>&1; then
  printf '  [OK]      %-20s %s\n' tailscale "$(command -v tailscale)"
else
  echo '  [NOTICE]  tailscale CLI not found; private remote access (Phase 10) unavailable'
fi
printf '  [INFO]    arch=%s node=%s\n' "$(uname -m)" "$(node --version 2>/dev/null || echo none)"

if command -v podman >/dev/null 2>&1; then
  if podman info >/dev/null 2>&1; then
    echo '  [OK]      Podman engine reachable'
    vm_sock="$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null || true)"
    [[ -n "$vm_sock" ]] && printf '  [INFO]    Podman machine API socket: unix://%s\n' "$vm_sock"
  else
    echo '  [ERROR]   Podman CLI found but engine unavailable; start/inspect Podman machine'
    missing=1
  fi
fi

if [[ -z "${PODMAN_DOCKER_HOST:-}" ]]; then
  echo '  [NOTICE]  PODMAN_DOCKER_HOST unset. Export the socket above before Terraform targets.'
else
  printf '  [INFO]    PODMAN_DOCKER_HOST=%s\n' "$PODMAN_DOCKER_HOST"
  sock="${PODMAN_DOCKER_HOST#unix://}"
  if [[ "$PODMAN_DOCKER_HOST" == unix://* && -S "$sock" ]]; then
    # Identity proof: the Docker-compatible /version must report a Podman Engine component.
    if curl -sf --max-time 5 --unix-socket "$sock" http://d/version | grep -q '"Name":"Podman Engine"'; then
      echo '  [OK]      Socket identifies as Podman Engine (not Docker Desktop)'
    else
      echo '  [ERROR]   Socket does not identify as Podman Engine; refuse Terraform against it'
      missing=1
    fi
  else
    echo '  [WARN]    Socket not found or non-local; a local unix:// Podman socket is required.'
    missing=1
  fi
fi
printf '\n'
if ((missing)); then
  echo 'Prerequisites missing or unavailable; inspect lines above.'
  exit 2
fi
echo 'Host-side prerequisites available. Runtime compatibility is proven only by smoke/health targets.'
