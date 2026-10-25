#!/usr/bin/env python3
"""Operator-invoked Phase 10 lifecycle drill; synthetic owner, no data-root deletion."""
import json
import os
import secrets
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PODMAN = os.environ.get("PODMAN", "podman")


def command(args, data=None):
    return subprocess.check_output(args, input=data, text=True, cwd=ROOT)


def sql(query, role="fray_backup"):
    return command(
        [
            PODMAN,
            "exec",
            "-i",
            "fray-postgres",
            "psql",
            "-XqAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            role,
            "-d",
            "fray",
        ],
        query,
    ).strip()


def fingerprints():
    return json.loads(sql((ROOT / "scripts/sql/table_fingerprints.sql").read_text()))


def others():
    records = json.loads(command([PODMAN, "ps", "-a", "--format", "json"]))
    return {
        r["Id"]: r["State"]
        for r in records
        if (r.get("Labels") or {}).get("io.fraygrance.project") != "fraygrance"
    }


def main():
    owner = "probe-" + secrets.token_hex(3)
    prior_others = others()
    seeded = False
    try:
        sql(
            f"""
BEGIN;
INSERT INTO app.owners(username,display_name) VALUES('{owner}','Synthetic lifecycle check');
DO $$
DECLARE owner_key uuid; fragrance_key uuid; entry_key uuid; season_key text;
BEGIN
  SELECT id INTO owner_key FROM app.owners WHERE username='{owner}';
  SELECT id INTO fragrance_key FROM app.fragrances WHERE identity_status='verified' ORDER BY id LIMIT 1;
  IF fragrance_key IS NULL THEN RAISE EXCEPTION 'Need one verified canonical fixture'; END IF;
  INSERT INTO app.collection_entries(owner_id,fragrance_id,state,rating,personal_note)
    VALUES(owner_key,fragrance_key,'sampled',4,'Synthetic lifecycle annotation') RETURNING id INTO entry_key;
  UPDATE app.collection_entries SET state='owned' WHERE id=entry_key;
  UPDATE app.collection_entries SET state='previously_owned' WHERE id=entry_key;
  FOREACH season_key IN ARRAY ARRAY['spring','summer','autumn','winter'] LOOP
    INSERT INTO app.seasonal_preferences(owner_id,season,choices,free_text)
      VALUES(owner_key,season_key,'{{"notes":{{"Bergamot":"love"}},"families":{{}},"accords":{{}},"traits":{{}}}}','Synthetic seasonal annotation');
    INSERT INTO app.season_fragrances(owner_id,fragrance_id,season,affinity,affinity_origin)
      VALUES(owner_key,fragrance_key,season_key,'neutral','user');
  END LOOP;
END $$;
COMMIT;
""",
            "postgres",
        )
        seeded = True
        baseline = fingerprints()

        def verify(label):
            current = fingerprints()
            changed = [
                t
                for t in set(baseline) | set(current)
                if baseline.get(t) != current.get(t)
            ]
            if changed:
                raise RuntimeError(f"{label}: changed tables {changed}")
            print(
                f"LIFECYCLE_PASS {label}: {len(baseline)} table fingerprints unchanged",
                flush=True,
            )

        command(["make", "backup"])
        command(["make", "restore-test"])
        print(
            "LIFECYCLE_PASS synthetic history/notes/four-season backup restore",
            flush=True,
        )
        command(["make", "down"])
        command(["make", "start"])
        verify("down/start")
        command(["make", "restart"])
        verify("restart")
        command(["make", "recreate", "SERVICE=api", "AUTO_APPROVE=YES"])
        command(["make", "health"])
        verify("API recreation")
        command(["make", "destroy", "VERIFIED_BACKUP=YES"], "DESTROY F-RAY-GRANCE\n")
        command(["make", "provision", "AUTO_APPROVE=YES"])
        command(["make", "vault-unseal"])
        command(["make", "configure"])
        command(["make", "health"])
        verify("stateless app destroy/reprovision/configure")
        if others() != prior_others:
            raise RuntimeError(
                "Unrelated container inventory/state changed; inspect before continuing"
            )
        print(
            f"LIFECYCLE_PASS unrelated containers unchanged ({len(prior_others)})",
            flush=True,
        )
    finally:
        if seeded:
            command(["make", "start"])
            command(["bash", "scripts/purge-synthetic-owner.sh", owner])
            print("LIFECYCLE_CLEANUP synthetic owner removed", flush=True)


if __name__ == "__main__":
    main()
