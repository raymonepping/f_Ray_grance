#!/usr/bin/env python3
"""Verify dump/manifest consistency while a synthetic seasonal record changes."""
import secrets
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(args, data=None):
    return subprocess.check_output(args, input=data, text=True, cwd=ROOT, timeout=120)


def sql(query):
    return run(
        [
            "podman",
            "exec",
            "-i",
            "fray-postgres",
            "psql",
            "-XqAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "fray",
        ],
        query,
    )


def main():
    owner = "probe-" + secrets.token_hex(3)
    stop = threading.Event()
    errors = []
    changes = []
    sql(
        f"INSERT INTO app.owners(username,display_name) VALUES('{owner}','Synthetic concurrency check');\nINSERT INTO app.seasonal_preferences(owner_id,season) SELECT id,'spring' FROM app.owners WHERE username='{owner}';"
    )

    def writer():
        try:
            while not stop.is_set():
                sql(
                    f"UPDATE app.seasonal_preferences SET free_text='Synthetic concurrent revision {len(changes)}' WHERE owner_id=(SELECT id FROM app.owners WHERE username='{owner}');"
                )
                changes.append(1)
                stop.wait(0.03)
        except Exception as error:
            errors.append(error)

    thread = threading.Thread(target=writer)
    try:
        thread.start()
        run(["make", "backup"])
        stop.set()
        thread.join()
        if errors:
            raise errors[0]
        if len(changes) < 2:
            raise RuntimeError("Concurrency fixture did not perform enough writes")
        run(["make", "restore-test"])
        print(
            f"CONCURRENT_BACKUP_PASS: {len(changes)} synthetic revisions; all restored fingerprints match"
        )
    finally:
        stop.set()
        if thread.is_alive():
            thread.join()
        run(["bash", "scripts/purge-synthetic-owner.sh", owner])
        print("CONCURRENT_BACKUP_CLEANUP: synthetic owner removed")


if __name__ == "__main__":
    main()
