"""Accepted execution prompts and explicitly registered future drafts."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASES = {f"{i:02d}" for i in range(11)}


def expected_phases(agent):
    # Phases 11 (ADR-010), 12 (ADR-011), 13 (ADR-014, My Spectrum) and 14 (ADR-015, sidebar
    # order) are accepted add-ons for Claude and Codex; IBM Bob stays on 00-10. Phase 15
    # (ADR-016, evidence-backed revisions) is accepted for Claude only.
    extra = {"11", "12", "13", "14"} if agent in {"Claude", "Codex"} else set()
    if agent == "Claude":
        extra |= {"15"}
    return PHASES | extra


def accepted_prompts(agent):
    docs = sorted((ROOT / "prompts" / agent).glob("*.md"))
    expected = expected_phases(agent)
    assert len(docs) == len(expected), (agent, len(docs))
    assert {p.name.split("_")[0] for p in docs} == expected
    return docs


def accepted_inventory():
    """Every accepted stage prompt per agent, plus the launchers."""
    stages = {a: accepted_prompts(a) for a in ("Claude", "Codex", "IBM_Bob")}
    launchers = sorted((ROOT / "prompts" / "launchers").glob("*.md"))
    return stages, launchers
