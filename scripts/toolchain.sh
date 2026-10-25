#!/usr/bin/env bash
# Project-local Node.js 24 LTS (matches NODE_IMAGE). Official nodejs.org build,
# SHASUMS256-verified, no Homebrew shared libraries (see CHANGELOG / Phase 02).
set -euo pipefail
V="${FRAY_NODE_VERSION:-24.21.0}"
T="${FRAY_TOOLCHAIN_DIR:-$HOME/.local/share/f-ray-grance/toolchain}"
d="$T/node-v$V-darwin-arm64"
if [[ -x "$d/bin/node" ]]; then
  echo "toolchain ok: $("$d/bin/node" --version) at $d"
  exit 0
fi
mkdir -p "$T"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
f="node-v$V-darwin-arm64.tar.xz"
curl -sfL -o "$tmp/$f" "https://nodejs.org/dist/v$V/$f"
curl -sfL "https://nodejs.org/dist/v$V/SHASUMS256.txt" | grep " $f\$" >"$tmp/sum.txt"
(cd "$tmp" && shasum -a 256 -c sum.txt >/dev/null)
tar -xf "$tmp/$f" -C "$T"
echo "toolchain installed: $("$d/bin/node" --version) at $d"
