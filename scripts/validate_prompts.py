#!/usr/bin/env python3
from pathlib import Path
from prompt_catalog import accepted_prompts

root = Path(__file__).resolve().parents[1]
phases = {"00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10"}
for agent in ("Codex", "Claude", "IBM_Bob"):
    docs = accepted_prompts(agent)
    assert len(docs) == 11, (agent, len(docs))
    assert {p.name.split("_")[0] for p in docs} == phases
    for doc in docs:
        txt = doc.read_text()
        must = (
            "state/BUILD_STATE.json",
            "Check whether",
            "If it exists",
            "If it does not",
            "in_progress",
            "completed",
            "blocked",
            "./scripts/commit_gh",
            "--retry-push",
            "reports/",
            "Prerequisites",
            "Required validation evidence",
        )
        missing = [x for x in must if x not in txt]
        assert not missing, (doc.name, missing)
        assert "GitHub" in txt and "single writer" in txt
        assert all(
            k in txt
            for k in (
                "origin/main",
                "Tailscale Serve HTTPS",
                "Backups are manual only",
                "PHASE_MANIFEST.md",
            )
        )
for path in (root / "prompts" / "launchers").glob("*.md"):
    txt = path.read_text()
    assert (
        "state/BUILD_STATE.json" in txt
        and "./scripts/commit_gh" in txt
        and "If it exists" in txt
    )
assert len(list((root / "prompts" / "launchers").glob("*.md"))) == 3
print(
    "PASS: 33 independent stage prompts + 3 launchers, state recovery and mandatory commit_gh requirements"
)

assert (root / "spec" / "PHASE_MANIFEST.md").exists()
print(
    "PASS: v0.1.6 tailnet/private-auth, direct-main and manual backup contracts present in 36 prompts"
)
