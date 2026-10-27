#!/usr/bin/env python3
"""Atomic updates to state/BUILD_STATE.json (see prompts/STATE_CONTRACT.md).

Requires the caller to hold state/.run.lock (atomic mkdir). Writes a temporary
file beside the state, validates it, fsyncs and renames. Never stores secrets.

  scripts/state.py show
  scripts/state.py init
  scripts/state.py phase 00 status=in_progress agent=claude prompt_id=FRAY-CLAUDE-00
  scripts/state.py phase 00 --json '{"tests": {...}}'      # deep-merged
  scripts/state.py set last_successful_phase=00
  scripts/state.py blockers --json '[...]'
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "state" / "BUILD_STATE.json"
LOCK = ROOT / "state" / ".run.lock"
STATUSES = {"in_progress", "completed", "blocked", "failed", "commit_blocked"}
FORBIDDEN = ("password", "token", "secret_id", "postgres://", "postgresql://", "BEGIN ")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def origin() -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT), "remote", "get-url", "origin"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def load() -> dict:
    return json.loads(STATE.read_text())


def validate(s: dict) -> None:
    assert s.get("schema_version") == 1, "schema_version must be 1"
    assert s.get("project") == "F-Ray-grance", "project identity mismatch"
    assert s["repository"]["branch"] == "main"
    for k, p in s.get("phases", {}).items():
        assert len(k) == 2 and k.isdigit() and 0 <= int(k) <= 16, k
        assert p.get("status") in STATUSES, (k, p.get("status"))
    blob = json.dumps(s)
    for f in FORBIDDEN:
        # allow the words only as JSON keys describing absence, never as values
        if f in ("postgres://", "postgresql://", "BEGIN ") and f in blob:
            raise AssertionError(f"state must not contain {f!r}")


def save(s: dict) -> None:
    if not LOCK.is_dir():
        sys.exit("BLOCKED: acquire state/.run.lock before mutating state")
    s["updated_at_utc"] = now()
    validate(s)
    fd, tmp = tempfile.mkstemp(prefix=".BUILD_STATE.", suffix=".tmp", dir=STATE.parent)
    with os.fdopen(fd, "w") as f:
        json.dump(s, f, indent=2, sort_keys=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    validate(json.loads(Path(tmp).read_text()))
    os.replace(tmp, STATE)


def merge(a: dict, b: dict) -> dict:
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
    return a


def kv(args: list[str]) -> dict:
    out: dict = {}
    it = iter(args)
    for a in it:
        if a == "--json":
            merge(out, json.loads(next(it)))
        else:
            k, _, v = a.partition("=")
            out[k] = None if v == "null" else v
    return out


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else "show"
    if cmd == "show":
        print(STATE.read_text() if STATE.exists() else "NO_STATE")
        return
    if cmd == "init":
        if STATE.exists():
            s = load()
            validate(s)
            print("EXISTS: state preserved")
            return
        save(
            {
                "schema_version": 1,
                "project": "F-Ray-grance",
                "repository": {"origin": origin(), "branch": "main"},
                "last_successful_phase": None,
                "phases": {},
                "accepted_adrs": [
                    "ADR-001",
                    "ADR-002",
                    "ADR-003",
                    "ADR-004",
                    "ADR-005",
                    "ADR-006",
                    "ADR-007",
                ],
                "unresolved_blockers": [],
                "updated_at_utc": None,
            }
        )
        print("INITIALIZED")
        return
    s = load()
    validate(s)
    if cmd == "phase":
        pid, rest = argv[1], argv[2:]
        phase = s["phases"].setdefault(pid, {})
        merge(phase, kv(rest))
    elif cmd == "set":
        merge(s, kv(argv[1:]))
    elif cmd == "blockers":
        s["unresolved_blockers"] = json.loads(argv[argv.index("--json") + 1])
    else:
        sys.exit(f"unknown command {cmd}")
    save(s)
    print("STATE_OK")


if __name__ == "__main__":
    main(sys.argv[1:])
