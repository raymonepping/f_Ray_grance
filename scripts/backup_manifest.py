#!/usr/bin/env python3
"""Backup manifest helper (values come from FRAY_M_* environment variables).

backup_manifest.py write <out>                         build a manifest
backup_manifest.py compare <manifest> <restored.json> <out> <seconds> <pgvector> <ts>
"""
import json
import os
import sys


def write(out: str) -> None:
    e = os.environ
    manifest = {
        "format": "pg_dump -Fc",
        "created_utc": e["FRAY_M_TS"],
        "file": e["FRAY_M_FILE"],
        "bytes": int(e["FRAY_M_BYTES"]),
        "sha256": e["FRAY_M_SHA"],
        "database": "fray",
        "postgres_version": e["FRAY_M_PG"],
        "pgvector_version": e["FRAY_M_VECTOR"],
        "schema_version": e["FRAY_M_SCHEMA"],
        "app_git_revision": e["FRAY_M_GIT"],
        "pg_dump_version": e["FRAY_M_TOOL"],
        "tables": json.loads(e["FRAY_M_TABLES"]),
        "excludes": [
            "vault",
            "ollama_models",
            "terraform_state",
            "postgres_global_roles",
        ],
    }
    with open(out, "w") as f:
        json.dump(manifest, f, indent=2)


def compare(manifest_path, restored_path, out, seconds, pgvector, ts) -> int:
    m = json.load(open(manifest_path))
    got = json.load(open(restored_path))
    diffs = {
        t: {"expected": m["tables"].get(t), "restored": got.get(t)}
        for t in sorted(set(m["tables"]) | set(got))
        if m["tables"].get(t) != got.get(t)
    }
    res = "PASS" if not diffs and pgvector else "FAIL"
    report = {
        "tested_utc": ts,
        "backup": m["file"],
        "result": res,
        "tables_compared": len(m["tables"]),
        "rows_total": sum(v["rows"] for v in got.values()),
        "restore_seconds": int(seconds),
        "pgvector": pgvector,
        "differences": diffs,
        "isolation": "disposable container, --network none, no volume; authoritative DB untouched",
    }
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(
        f"RESTORE_TEST_{res} backup={m['file']} tables={len(m['tables'])} "
        f"rows={report['rows_total']} restore={seconds}s pgvector={pgvector}"
    )
    for t, d in diffs.items():
        print("  DIFF", t, d)
    return 0 if res == "PASS" else 1


if __name__ == "__main__":
    if sys.argv[1] == "write":
        write(sys.argv[2])
    elif sys.argv[1] == "compare":
        sys.exit(compare(*sys.argv[2:8]))
    else:
        sys.exit("usage: backup_manifest.py write|compare ...")
