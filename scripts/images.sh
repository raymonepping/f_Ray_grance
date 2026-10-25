#!/usr/bin/env bash
# Pull pinned arm64 images and build project images. Podman is the image owner;
# Terraform only reads local images. --format docker keeps HEALTHCHECK metadata.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
PODMAN="${PODMAN:-podman}"
export COPYFILE_DISABLE=1 # no macOS ._ files in build contexts

for ref in "$PG_IMAGE" "$VAULT_IMAGE" "$OLLAMA_IMAGE" "$CADDY_IMAGE" "$NODE_IMAGE"; do
  if ! "$PODMAN" image exists "$ref"; then
    echo "pull $ref"
    "$PODMAN" pull -q --platform linux/arm64 "$ref" >/dev/null
  fi
  arch="$("$PODMAN" image inspect "$ref" --format '{{.Architecture}}')"
  [[ "$arch" == arm64 ]] || {
    echo "BLOCKED: $ref is $arch, not arm64 (would run emulated)" >&2
    exit 2
  }
done
echo "pinned images present (arm64)"

# macOS privacy controls deny podman read access to ~/Documents (observed
# "faccessat … operation not permitted"), and com.apple.* xattrs break podman
# tars. Stage each context into a clean temp copy and build from there.
stage="$(mktemp -d "${TMPDIR:-/tmp}/fray-build.XXXXXX")"
trap 'rm -rf "$stage"' EXIT

build() { # build <tag> <context-relative-to-repo> <containerfile-relative-to-context> [build-args...]
  local tag="$1" ctx="$2" file="$3"
  shift 3
  local dst="$stage/${tag//[:\/]/_}"
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.nuxt/' --exclude '.output/' \
    --exclude '.terraform/' --exclude 'coverage/' --exclude 'test-results/' --exclude 'playwright-report/' \
    --exclude '._*' --exclude '.DS_Store' --exclude '.env' --exclude '.env.*' \
    "$repo/$ctx/" "$dst/"
  xattr -rc "$dst" 2>/dev/null || true
  "$PODMAN" build -q --format docker --platform linux/arm64 -t "$tag" -f "$dst/$file" "$@" "$dst" >/dev/null
  echo "built $tag"
}

build localhost/fray-web:placeholder infra/images/web-placeholder Containerfile \
  --build-arg CADDY_IMAGE="$CADDY_IMAGE"

if [[ -f "$repo/apps/api/Containerfile" ]]; then
  build localhost/fray-api:current . apps/api/Containerfile --build-arg NODE_IMAGE="$NODE_IMAGE"
fi
if [[ -f "$repo/apps/web/Containerfile" ]]; then
  build localhost/fray-web:current . apps/web/Containerfile \
    --build-arg NODE_IMAGE="$NODE_IMAGE" --build-arg CADDY_IMAGE="$CADDY_IMAGE"
fi
