#!/usr/bin/env bash
# Reviewed application-only upgrade, gated on a fresh backup and restore.
# Database/Vault/Ollama images, networking and volumes require separate review.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
[[ "${AUTO_APPROVE:-}" == YES ]] || {
  echo 'REFUSED: review changes, then invoke make upgrade AUTO_APPROVE=YES (app containers only).' >&2
  exit 2
}
umask 077
work="$(mktemp -d "${FRAY_STATE_DIR:?}/upgrade.XXXXXX")"
trap 'rm -rf "$work"' EXIT
make test
make health
make backup
make restore-test
make images
bash scripts/tf.sh data plan -input=false -out="$work/data.plan" >/dev/null
bash scripts/tf.sh app plan -input=false -out="$work/app.plan" >/dev/null
for root in data app; do
  "${TF:-terraform}" -chdir="infra/terraform/$root" show -json "$work/$root.plan" >"$work/$root.json"
done
python3 - "$work" <<'PY'
import json,sys,pathlib
work=pathlib.Path(sys.argv[1])
for root in ['data','app']:
    plan=json.loads((work/f'{root}.json').read_text())
    for change in plan.get('resource_changes',[]):
        actions=change['change']['actions']
        if change.get('mode')=='data' or actions==['no-op']:
            continue
        address=change['address']
        if root!='app' or address not in {'docker_container.api[0]','docker_container.web'}:
            sys.exit(f'REFUSED: upgrade plan changes {root}/{address}; needs separate infrastructure review')
        if actions not in [['create'],['update'],['delete','create'],['create','delete']]:
            sys.exit(f'REFUSED: unexpected actions for {address}')
        print(f'APP_UPGRADE_PLAN {address}: {actions}')
PY
bash scripts/tf.sh app apply -input=false "$work/app.plan"
make configure
make health
make test-e2e
echo 'UPGRADE_OK: backup and restore verified; application plan applied; migrations/health/browser gates passed.'
