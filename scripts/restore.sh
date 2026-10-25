#!/usr/bin/env bash
# Explicit recovery into a NEW quarantined PostgreSQL container. No overwrite,
# volume deletion, network publication or automatic promotion to the live app.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
dump="${1:-}"
[[ -n "$dump" && "$dump" == /* && -f "$dump" ]] || {
  echo 'REFUSED: specify BACKUP=/absolute/path/to/a/trusted/archive.dump' >&2
  exit 2
}
echo 'Target: a NEW network-isolated PostgreSQL container. The live database stays unchanged.'
echo 'Use only a trusted project backup; PostgreSQL archives contain executable SQL.'
read -r -p 'Type RESTORE TO QUARANTINE to verify and retain a fresh target: ' answer
[[ "$answer" == 'RESTORE TO QUARANTINE' ]] || {
  echo 'Aborted'
  exit 2
}
bash "$repo/scripts/restore-test.sh" "$dump" retain-validated
