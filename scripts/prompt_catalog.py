"""Accepted execution prompts and explicitly registered future drafts."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASES = {f"{i:02d}" for i in range(11)}
DEFERRED = {
    "prompts/Claude/11_scent_academy_and_tutor.md",
    "prompts/Codex/11_scent_academy_and_tutor.md",
}
DRAFT_MARKER = (
    "**Status:** Deferred draft; outside the accepted Phase 00–10 execution plan."
)


def accepted_prompts(agent):
    docs = sorted((ROOT / "prompts" / agent).glob("*.md"))
    accepted = []
    for doc in docs:
        relative = doc.relative_to(ROOT).as_posix()
        if relative in DEFERRED:
            assert DRAFT_MARKER in doc.read_text(), (relative, "missing draft status")
        else:
            assert doc.name.split("_")[0] in PHASES, (relative, "unregistered phase")
            accepted.append(doc)
    assert len(accepted) == len(PHASES), (agent, len(accepted))
    assert {p.name.split("_")[0] for p in accepted} == PHASES
    return accepted
