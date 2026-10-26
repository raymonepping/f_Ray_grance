#!/usr/bin/env python3
"""Dump and fingerprint the same exported PostgreSQL snapshot.

Invoked by backup.sh; no credentials cross process arguments. The exporting
read-only transaction stays open until both pg_dump and manifest queries finish.
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

from backup_manifest import write

ROOT = Path(__file__).resolve().parents[1]


def capture(dump_path, manifest_path, filename, timestamp):
    podman = os.environ.get("PODMAN", "podman")
    pg = os.environ.get("FRAY_PG_CONTAINER", "fray-postgres")
    psql = [
        podman,
        "exec",
        "-i",
        pg,
        "psql",
        "-XqAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "fray_backup",
        "-d",
        "fray",
    ]
    session = subprocess.Popen(
        psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1
    )
    try:
        session.stdin.write(
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n"
        )
        session.stdin.flush()
        snapshot = session.stdout.readline().strip()
        if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot):
            raise RuntimeError("PostgreSQL did not provide a valid backup snapshot")

        def query(sql):
            transaction = f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '{snapshot}';\n{sql}\nROLLBACK;\n"
            return subprocess.check_output(psql, input=transaction, text=True).strip()

        with open(dump_path, "wb") as out:
            subprocess.run(
                [
                    podman,
                    "exec",
                    pg,
                    "pg_dump",
                    "-U",
                    "fray_backup",
                    "-d",
                    "fray",
                    "-Fc",
                    "--compress=6",
                    f"--snapshot={snapshot}",
                ],
                stdout=out,
                check=True,
            )
        with open(dump_path, "rb") as source:
            subprocess.run(
                [podman, "exec", "-i", pg, "pg_restore", "--list"],
                stdin=source,
                stdout=subprocess.DEVNULL,
                check=True,
            )
        with open(dump_path, "rb") as archive:
            checksum = hashlib.file_digest(archive, "sha256").hexdigest()
        values = {
            "TS": timestamp,
            "FILE": filename,
            "SHA": checksum,
            "BYTES": str(Path(dump_path).stat().st_size),
            "PG": query("SELECT current_setting('server_version');"),
            "VECTOR": query(
                "SELECT extversion FROM pg_extension WHERE extname='vector';"
            ),
            "SCHEMA": query(
                "SELECT coalesce(max(version)::text,'none') FROM app.schema_migrations;"
            ),
            "GIT": subprocess.check_output(
                ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True
            ).strip(),
            "TOOL": subprocess.check_output(
                [podman, "exec", pg, "pg_dump", "--version"], text=True
            ).strip(),
            "TABLES": query((ROOT / "scripts/sql/table_fingerprints.sql").read_text()),
            "SNAPSHOT": snapshot,
            # Image files this snapshot references, from the same snapshot (ADR-016): the image
            # archive taken afterwards must contain every one of them before the backup is published.
            # A CASE cannot guard a static reference to a missing table, so check first (schema < 5).
            "IMAGE_REFS": (
                "[]"
                if query("SELECT to_regclass('app.image_assets') IS NULL;") == "t"
                else query(
                    "SELECT coalesce(json_agg(json_build_object('path', storage_path, 'checksum', checksum) ORDER BY storage_path), '[]')::text "
                    "FROM (SELECT DISTINCT storage_path, checksum FROM app.image_assets WHERE storage_path IS NOT NULL) r;"
                )
            ),
        }
        os.environ.update({f"FRAY_M_{k}": v for k, v in values.items()})
        write(manifest_path)
    finally:
        if session.poll() is None:
            try:
                session.stdin.write("ROLLBACK;\n\\q\n")
                session.stdin.flush()
                session.wait(timeout=10)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                session.terminate()
                session.wait(timeout=10)
        session.stdin.close()
        session.stdout.close()


if __name__ == "__main__":
    capture(*sys.argv[1:5])
