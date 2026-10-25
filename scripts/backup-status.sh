#!/usr/bin/env bash
# Honest manual-backup status (ADR-007). No claim of protection beyond the last
# verified manual backup and the last operator-RECORDED off-device copy.
#   backup-status.sh                      report
#   backup-status.sh record <dump> <loc>  record an operator-verified off-device copy
set -euo pipefail
DIR="${FRAY_BACKUP_DIR:?}"
LOG="$DIR/offdevice-copies.jsonl"
if [[ "${1:-}" == record ]]; then
  f="${2:?BACKUP=<dump file> required}"
  loc="${3:?LOCATION=<label> required}"
  [[ -f "$f" && -f "${f%.dump}.manifest.json" ]] || {
    echo "REFUSED: $f is not a complete backup" >&2
    exit 2
  }
  want="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "${f%.dump}.manifest.json")"
  [[ "$(shasum -a 256 "$f" | cut -d' ' -f1)" == "$want" ]] || {
    echo 'REFUSED: checksum mismatch' >&2
    exit 2
  }
  umask 077
  python3 -c 'import json,sys,datetime;print(json.dumps({"recorded_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),"file":sys.argv[1].rsplit("/",1)[-1],"sha256":sys.argv[2],"location":sys.argv[3],"verified_by":"operator"}))' "$f" "$want" "$loc" >>"$LOG"
  echo "RECORDED off-device copy of $(basename "$f") at '$loc' (operator-attested)"
  exit 0
fi
python3 - "$DIR" <<'PY'
import json,sys,hashlib,pathlib,datetime
d=pathlib.Path(sys.argv[1]); now=datetime.datetime.now(datetime.timezone.utc)
mans=sorted(d.glob('fray-*.manifest.json'))
print(f'Backup directory: {d}  (manual only; no scheduler, RPO unbounded between backups)')
last=None
for m in reversed(mans):
    j=json.loads(m.read_text()); f=d/j['file']
    if f.exists() and hashlib.sha256(f.read_bytes()).hexdigest()==j['sha256']:
        last=j; break
    print(f'  [WARN] {m.name}: dump missing or checksum mismatch')
if not last:
    print('  LAST VERIFIED BACKUP: NONE — no protection claim can be made'); sys.exit(1)
t=datetime.datetime.strptime(last['created_utc'],'%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
age=now-t
print(f"  LAST VERIFIED BACKUP: {last['file']}  age={age.days}d {age.seconds//3600}h  schema={last['schema_version']}  tables={len(last['tables'])}")
log=d/'offdevice-copies.jsonl'; copies=[json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []
mine=[c for c in copies if c['file']==last['file']]
print(f"  OFF-DEVICE COPY OF LAST BACKUP: {mine[-1]['location']+' (recorded '+mine[-1]['recorded_utc']+')' if mine else 'NOT RECORDED'}")
tests=sorted((d/'restore-tests').glob('*.json')) if (d/'restore-tests').exists() else []
rt=[json.loads(p.read_text()) for p in tests]
ok=[r for r in rt if r.get('result')=='PASS']
print(f"  LAST RESTORE TEST: {ok[-1]['tested_utc']+' PASS of '+ok[-1]['backup'] if ok else 'NONE PASSED'}")
PY
