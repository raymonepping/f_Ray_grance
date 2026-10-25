# ADR-006: Single-writer agents commit directly to main via commit_gh

**Status:** Accepted | **Date:** 2026-10-24 | **Baseline:** v0.1.6

## Decision

- `main` is the sole build-agent branch; no mandatory PRs or feature branches.
- Every phase independently checks `state/BUILD_STATE.json`, previous pushed completion, repository identity, clean working boundaries and an exclusive writer lock; only one Codex/Claude/Bob process may modify the project at a time.
- The repository-local `scripts/commit_gh` selectively stages only operator-authorized file paths and pushes the verified GitHub origin `main` branch. Refuse detached HEAD, other branches, wrong origin, unrelated staged files, unsafe paths, secrets and forced push.
- Never auto-merge, force-push, rebase, change GitHub branch rules or bypass remote protections. If `main` rejects a push, record a blocker and request an operator decision.
- State and sanitized reports are committed; `state` holds no private perfume notes, tokens, passwords, absolute private backup locations, secrets or database dumps.

## Consequences

- Simple workflow and no PR overhead for a single operator; fewer review gates. Mitigate with local tests, diff checks, phase evidence and one writer.
- A pushed commit is not evidence of passing remote CI; report observed checks separately.
- **Git source commits are not PostgreSQL backups.** See ADR-007.
