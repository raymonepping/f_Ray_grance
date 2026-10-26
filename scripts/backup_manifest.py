#!/usr/bin/env python3
"""Backup manifest helper (values come from FRAY_M_* environment variables).

backup_manifest.py write <out>                         build a manifest
backup_manifest.py compare <manifest> <restored.json> <out> <seconds> <pgvector> <ts>
                                                       table comparison (a stage result, not a receipt)
backup_manifest.py receipt <manifest> <stages.jsonl> <compare.json> <out> <ts> <exit code>
                                                       the ONE restore receipt for an attempt (ADR-016)
"""
import json
import os
import sys


def write(out: str) -> None:
    e = os.environ
    manifest = {
        "format": "pg_dump -Fc",
        "consistent_snapshot": e.get("FRAY_M_SNAPSHOT"),
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
        "image_refs": json.loads(e.get("FRAY_M_IMAGE_REFS") or "[]"),
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
    res = "PASS" if not diffs and pgvector == m["pgvector_version"] else "FAIL"
    report = {
        "result": res,
        "tables_compared": len(m["tables"]),
        "rows_total": sum(v["rows"] for v in got.values()),
        "restore_seconds": int(seconds),
        "pgvector": pgvector,
        "differences": diffs,
    }
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(
        f"TABLES_{res} backup={m['file']} tables={len(m['tables'])} "
        f"rows={report['rows_total']} restore={seconds}s pgvector={pgvector}"
    )
    for t, d in diffs.items():
        print("  DIFF", t, d)
    return 0 if res == "PASS" else 1


def receipt(manifest_path, stages_path, compare_path, out, ts, rc) -> None:
    """Written once per attempt, after every stage ran: PASS only for a complete, all-PASS run."""
    m = json.load(open(manifest_path))
    stages = [json.loads(line) for line in open(stages_path) if line.strip()]
    ok = int(rc) == 0 and stages and all(s["result"] == "PASS" for s in stages) and stages[-1]["stage"] == "complete"
    failed = next((s for s in stages if s["result"] == "FAIL"), None)
    cmp = json.load(open(compare_path)) if os.path.exists(compare_path) else {}
    rs = m.get("recovery_set")
    report = {
        "receipt_version": 2,
        "tested_utc": ts,
        "backup": m["file"],
        "backup_sha256": m["sha256"],
        # The complete set this receipt covers; legacy backups (before ADR-016) have none and their
        # receipts never certify independent recovery of the image store.
        "recovery_set": rs,
        "complete_set": bool(rs),
        "result": "PASS" if ok else "FAIL",
        "failed_stage": None if ok else (failed or {"stage": stages[-1]["stage"] if stages else "start"})["stage"],
        "failure": None if ok else (failed or {}).get("detail"),
        "stages": stages,
        "environment": os.environ.get("FRAY_RESTORE_ENV_LABEL", "local Podman connection"),
        "independent_recovery_operator_attested": bool(ok) and os.environ.get("FRAY_RESTORE_INDEPENDENT") == "YES",
        "tables_compared": cmp.get("tables_compared"),
        "rows_total": cmp.get("rows_total"),
        "restore_seconds": cmp.get("restore_seconds"),
        "pgvector": cmp.get("pgvector"),
        "differences": cmp.get("differences"),
        "isolation": "disposable container and image volume, --network none; authoritative DB and image volume untouched",
    }
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"RECEIPT {report['result']} {os.path.basename(out)}" + ("" if ok else f" failed_stage={report['failed_stage']}"))


if __name__ == "__main__":
    if sys.argv[1] == "write":
        write(sys.argv[2])
    elif sys.argv[1] == "compare":
        sys.exit(compare(*sys.argv[2:8]))
    elif sys.argv[1] == "receipt":
        receipt(*sys.argv[2:8])
    else:
        sys.exit("usage: backup_manifest.py write|compare ...")
