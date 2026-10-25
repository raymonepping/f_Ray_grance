#!/usr/bin/env bash
set -euo pipefail

printf '\nF-Ray-grance Phase 00 prerequisite inspection\n\n'
missing=0
for tool in terraform ansible-playbook ansible-galaxy podman vault make curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '  [OK]      %-20s %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '  [MISSING] %s\n' "$tool"
    missing=1
  fi
done
if command -v podman >/dev/null 2>&1; then
  if podman info >/dev/null 2>&1; then
    echo '  [OK]      Podman engine reachable'
  else
    echo '  [ERROR]   Podman CLI found but engine unavailable; start/inspect Podman machine'
    missing=1
  fi
fi
if [[ -z "${PODMAN_DOCKER_HOST:-}" ]]; then
  echo '  [NOTICE]  PODMAN_DOCKER_HOST unset. Verify a Podman-owned socket before Terraform smoke.'
else
  printf '  [INFO]    PODMAN_DOCKER_HOST=%s\n' "$PODMAN_DOCKER_HOST"
  if [[ "$PODMAN_DOCKER_HOST" == unix://* && -S "${PODMAN_DOCKER_HOST#unix://}" ]]; then
    echo '  [OK]      Unix socket exists. IMPORTANT: still confirm it belongs to Podman.'
  else
    echo '  [WARN]    Socket not found or non-local; Phase 00 requires a local Unix socket.'
    missing=1
  fi
fi
printf '\n'
if ((missing)); then
  echo 'Prerequisites missing or unavailable; inspect lines above.'
  exit 2
fi
echo 'Host-side binaries available. Runtime compatibility remains unverified.'
