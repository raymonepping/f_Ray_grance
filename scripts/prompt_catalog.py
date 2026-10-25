"""Accepted execution prompts and explicitly registered future drafts."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASES = {f"{i:02d}" for i in range(11)}


def expected_phases(agent):
    return PHASES | ({"11"} if agent in {"Claude", "Codex"} else set())


def accepted_prompts(agent):
    docs = sorted((ROOT / "prompts" / agent).glob("*.md"))
    expected = expected_phases(agent)
    assert len(docs) == len(expected), (agent, len(docs))
    assert {p.name.split("_")[0] for p in docs} == expected
    return docs
