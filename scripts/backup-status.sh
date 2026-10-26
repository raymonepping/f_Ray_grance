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
  # The whole recovery set (dump, image archive, image sidecar) must be present and match the
  # checksums its manifest binds (ADR-016); a dump alone does not recover the image store.
  umask 077
  python3 - "${f%.dump}.manifest.json" "$loc" "$LOG" <<'PYREC' || exit 2
import datetime,hashlib,json,pathlib,sys
man=pathlib.Path(sys.argv[1]); m=json.loads(man.read_text()); d=man.parent
sha=lambda p: hashlib.file_digest(open(p,'rb'),'sha256').hexdigest()
rs=m.get('recovery_set')
if not rs:
    sys.exit('REFUSED: legacy backup without a recovery set; take a new make backup and copy that one')
files={'dump':rs['dump']}
for k in ('images_tar','images_manifest'):
    if rs.get(k): files[k]=rs[k]
for k,e in files.items():
    p=d/e['file']
    if not p.is_file() or sha(p)!=e['sha256']:
        sys.exit(f"REFUSED: {e['file']} missing or checksum mismatch")
files['manifest']={'file':man.name,'sha256':sha(man)}
rec={"recorded_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),"file":m['file'],"sha256":m['sha256'],
     "recovery_set":files,"location":sys.argv[2],"verified_by":"operator"}
open(sys.argv[3],'a').write(json.dumps(rec)+'\n')
PYREC
  echo "RECORDED off-device copy of the recovery set of $(basename "$f") at '$loc' (operator-attested)"
  exit 0
fi
python3 - "$DIR" <<'PY'
import json,sys,hashlib,pathlib,datetime
d=pathlib.Path(sys.argv[1]); now=datetime.datetime.now(datetime.timezone.utc)
mans=sorted(d.glob('fray-*.manifest.json'))
print(f'Backup directory: {d}  (manual only; no scheduler, RPO unbounded between backups)')
def set_ok(j):
    """Every file of the backup's recovery set is present and matches its bound checksum."""
    rs=j.get('recovery_set') or {'dump':{'file':j['file'],'sha256':j['sha256']}}
    for e in rs.values():
        if not e: continue
        f=d/e['file']
        if not f.exists() or hashlib.sha256(f.read_bytes()).hexdigest()!=e['sha256']: return False
    return True
last=None
for m in reversed(mans):
    j=json.loads(m.read_text())
    if set_ok(j):
        last=j; break
    print(f'  [WARN] {m.name}: a file of its recovery set is missing or does not match its checksum')
if not last:
    print('  LAST VERIFIED BACKUP: NONE — no protection claim can be made'); sys.exit(1)
t=datetime.datetime.strptime(last['created_utc'],'%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc)
age=now-t
kind='complete set (database + images)' if last.get('recovery_set') else 'LEGACY: database dump only bound; take a new backup'
print(f"  LAST VERIFIED BACKUP: {last['file']}  age={age.days}d {age.seconds//3600}h  schema={last['schema_version']}  tables={len(last['tables'])}  {kind}")
log=d/'offdevice-copies.jsonl'; copies=[json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []
mine=[c for c in copies if c['file']==last['file'] and c.get('sha256')==last['sha256'] and c.get('recovery_set',{}).get('dump',{}).get('sha256')==last['sha256']]
print(f"  OFF-DEVICE COPY OF LAST BACKUP SET: {mine[-1]['location']+' (recorded '+mine[-1]['recorded_utc']+')' if mine else 'NOT RECORDED'}")
tests=sorted((d/'restore-tests').glob('*.json')) if (d/'restore-tests').exists() else []
rt=[json.loads(p.read_text()) for p in tests]
# Only receipt v2 (ADR-016) covers a complete set; earlier receipts were written before the image
# checks ran and can say PASS for a restore that then failed, so they never count.
ok=[r for r in rt if r.get('receipt_version')==2 and r.get('result')=='PASS' and r.get('complete_set')]
print(f"  LAST COMPLETE RESTORE TEST (see environment in report): {ok[-1]['tested_utc']+' PASS of '+ok[-1]['backup'] if ok else 'NONE PASSED'}")
fails=[r for r in rt if r.get('receipt_version')==2 and r.get('result')=='FAIL']
if fails and (not ok or fails[-1]['tested_utc']>ok[-1]['tested_utc']):
    print(f"  LATEST RESTORE ATTEMPT FAILED: {fails[-1]['tested_utc']} {fails[-1]['backup']} at stage {fails[-1]['failed_stage']}")
independent=[r for r in ok if r.get('independent_recovery_operator_attested') and r.get('backup_sha256')==last['sha256'] and r.get('recovery_set')==last.get('recovery_set')]
print(f"  INDEPENDENT RESTORE OF LAST BACKUP SET: {independent[-1]['environment']+' (operator-attested)' if independent else 'NOT RECORDED — local disposable restore alone does not prove VM-loss recovery'}")
PY
