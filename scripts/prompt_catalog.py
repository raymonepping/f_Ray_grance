"""Accepted execution prompts and explicitly registered future drafts."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASES = {f"{i:02d}" for i in range(11)}


def expected_phases(agent):
    # Phases 11 (ADR-010) and 12 (ADR-011) are accepted add-ons for Claude and Codex only;
    # Phase 13 (ADR-014, My Spectrum) for Claude only.
    extra = {"11", "12"} if agent in {"Claude", "Codex"} else set()
    if agent == "Claude":
        extra |= {"13"}
    return PHASES | extra


def accepted_prompts(agent):
    docs = sorted((ROOT / "prompts" / agent).glob("*.md"))
    expected = expected_phases(agent)
    assert len(docs) == len(expected), (agent, len(docs))
    assert {p.name.split("_")[0] for p in docs} == expected
    return docs
