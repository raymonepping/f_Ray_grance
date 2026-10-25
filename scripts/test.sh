#!/usr/bin/env bash
# F-Ray-grance quality gate. Each stage prints PASS/FAIL; exits non-zero on any FAIL.
# Stages are added as phases land (apps/api, apps/web tests run when present).
set -uo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
fail=0
run() { # run <label> <command...>
  local label="$1"
  shift
  if out="$("$@" 2>&1)"; then
    printf '  [PASS] %s\n' "$label"
  else
    printf '  [FAIL] %s\n%s\n' "$label" "$(tail -20 <<<"$out" | sed 's/^/         /')"
    fail=1
  fi
}

echo 'F-Ray-grance test gate'
run 'docs + prompts validation' make -s validate-docs
run 'shell syntax (scripts/*.sh)' bash -c 'for f in scripts/*.sh scripts/probes/*.sh; do bash -n "$f" || exit 1; done'
run 'python compile (scripts/*.py)' python3 -m py_compile scripts/state.py scripts/backup_manifest.py scripts/validate_release.py scripts/validate_prompts.py
for root in data app phase00; do
  run "terraform fmt ($root)" terraform -chdir="infra/terraform/$root" fmt -check -diff
done
for root in data app; do
  run "terraform validate ($root)" bash -c "terraform -chdir=infra/terraform/$root init -backend=false -input=false >/dev/null && terraform -chdir=infra/terraform/$root validate -no-color"
done
run 'ansible syntax-check' bash -c 'cd ansible && ansible-playbook --syntax-check site.yml </dev/null'
run 'no tracked secrets/state/backups' bash -c '! git ls-files | grep -Ei "(\.tfstate|\.env$|vault-init|\.dump$|secrets/|backups/|\.pem$|\.key$)"'
run 'no 0.0.0.0 host publish in Terraform' bash -c '! grep -RnE "ip[[:space:]]*=[[:space:]]*\"0\.0\.0\.0\"" infra/terraform'
run 'no scheduler installed (ADR-007)' bash -c '! grep -RniE "crontab|launchctl|LaunchAgents|systemd.*timer" scripts Makefile ansible --include=*.sh --include=*.yml --include=Makefile | grep -v "^scripts/test.sh"'
if command -v gitleaks >/dev/null; then
  run 'gitleaks (tracked files)' gitleaks git --no-banner --redact --log-level warn .
fi
if [[ -f package.json ]]; then
  run 'npm workspaces: typecheck' npm run -s typecheck
  run 'npm workspaces: unit/integration tests' npm test -s
fi

((fail)) && {
  echo 'TEST: FAIL'
  exit 1
}
echo 'TEST: PASS'
