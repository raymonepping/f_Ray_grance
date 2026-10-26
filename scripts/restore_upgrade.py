#!/usr/bin/env python3
"""Bring an ISOLATED restored database forward to the current schema (ADR-016, review R3).

restore_upgrade.py <container> [--upto N]

Mirrors apps/api/src/db/migrate.ts: the ledger (app.schema_migrations) is verified first (every
applied version must exist in db/migrations with the same checksum, so a changed migration or a
backup from a newer build is refused); then each missing migration runs in its own transaction as
fray_owner and is recorded with its checksum. Only ever pointed at a disposable restore-test or
fixture container, never at fray-postgres. Prints "UPGRADED from=<v> to=<v>" or "CURRENT <v>".
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE_RE = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")
# As migrate.ts: the ledger is owned by fray_owner and only readable by the runtime role.
LEDGER = (
    "CREATE TABLE IF NOT EXISTS app.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, "
    "checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n"
    "REVOKE ALL ON app.schema_migrations FROM fray_runtime;\nGRANT SELECT ON app.schema_migrations TO fray_runtime;\n"
)


def main(argv):
    container = argv[0]
    if container == "fray-postgres":
        sys.exit("REFUSED: restore_upgrade.py never migrates the live database")
    upto = int(argv[argv.index("--upto") + 1]) if "--upto" in argv else None
    podman = os.environ.get("PODMAN", "podman")
    psql = [podman, "exec", "-i", container, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "fray"]

    migrations = []
    for f in sorted((ROOT / "db" / "migrations").iterdir()):
        m = FILE_RE.match(f.name)
        if m:
            sql = f.read_text()
            migrations.append((int(m[1]), m[2], sql, hashlib.sha256(sql.encode()).hexdigest()))
    if [v for v, *_ in migrations] != list(range(1, len(migrations) + 1)):
        sys.exit("REFUSED: migration numbering gap")
    if upto is not None:
        migrations = [m for m in migrations if m[0] <= upto]

    has_ledger = subprocess.check_output(psql, input="SELECT to_regclass('app.schema_migrations') IS NOT NULL;", text=True).strip() == "t"
    applied = {}
    if has_ledger:
        for line in subprocess.check_output(psql, input="SELECT version, checksum FROM app.schema_migrations ORDER BY version;", text=True).split():
            v, c = line.split("|")
            applied[int(v)] = c.strip()
    known = {v: c for v, _, _, c in migrations}
    for v, c in applied.items():
        if v not in known:
            sys.exit(f"REFUSED: the backup has migration {v}, unknown to this build; restore it with the matching application revision")
        if known[v] != c:
            sys.exit(f"REFUSED: checksum mismatch for applied migration {v:04d}; this build's migration differs from the one the backup ran")
    start = max(applied, default=0)
    for v, name, sql, checksum in migrations:
        if v in applied:
            continue
        script = (
            "BEGIN;\nSET LOCAL ROLE fray_owner;\nSET LOCAL search_path = app, public;\n"
            + LEDGER
            + sql
            + f"\n;INSERT INTO app.schema_migrations (version, name, checksum) VALUES ({v}, '{name}', '{checksum}');\nCOMMIT;\n"
        )
        r = subprocess.run(psql, input=script, text=True, capture_output=True)
        if r.returncode != 0:
            sys.exit(f"RESTORE_UPGRADE_FAIL: migration {v:04d}_{name}: {r.stderr.strip()[:300]}")
    end = max([v for v, *_ in migrations], default=start)
    print(f"UPGRADED from={start} to={end}" if end > start else f"CURRENT {start}")


if __name__ == "__main__":
    main(sys.argv[1:])
