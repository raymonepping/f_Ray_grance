# Phase 09 — Seasonal choices and portability

Prompt FRAY-CODEX-09. Agent Codex. Date 2026-10-25. Predecessor Phase 08 `5fad65fe952f15748ffb4be3c2c6f1ba8240a5d5` was verified on GitHub main before work began. Resumed from the honest blocked checkpoint `bed67d02e8f7b6817945906fa1302f4b5acca1eb` after the operator confirmed the external writer finished.

## Delivery

- Expand-only migration 0003 adds four-dimensional seasonal choices, stable event UUIDs and authorship attribution for new manual corrections. Existing history and append-only protections remain. Import replays ordinary entry transitions without disabling protections.
- Four-season owner-scoped API and My DNA editor, explicit Love / Neutral / Avoid / Unsure choices with absence unrated, fragrance affinities, private seasonal notes and collection context. Ownership never implies liking. Collection, Compare and Discover accept seasonal context. Existing legacy note preferences remain visible when opening the new editor.
- Private versioned JSON export includes referenced canonical identities, variants, source observations/claims, manual corrections, owner annotations, exact status history and seasonal profiles. Credentials, sessions, owner IDs, vectors and other-owner annotations are excluded.
- Strict noncoercing validation, read-only preview, file/owner/target digest, explicit confirmation, serializable additive apply, collision detection and idempotency. Existing records are never overwritten. Production apply remains disabled until independent recovery is verified; synthetic tests enable it explicitly.
- Separate-database roundtrip verifies stable record and event identities, annotations, corrections and seasons. Invalid files and conflicts leave target records unchanged. Settings downloads in-browser; synthetic browser exports are consumed in memory, outside Git.
- Operator guide: [portability](../docs/portability.md). Application changes span `apps/api/src/{domain,repo,routes/v1}`, API configuration/tests, `apps/web/app/{pages,components}`, browser tests, migration 0003 and synthetic cleanup.

## Verification findings fixed

The first browser run passed 27/28 tests and caught HTTP validation coercing nullable exported values into empty strings, creating false self-import conflicts. Portability now has strict value-preserving validation and an HTTP export/preview regression; malformed scalar types return 400. A separate regression verifies old seasonal note choices survive the new editor.

The temporary documentation blocker is resolved. The two finished Phase 11 prompts are preserved and clearly marked deferred drafts. Their explicit registry is checked by the validators; unregistered phase files still fail. All 63 frozen documents remain hash-verified. The accepted execution plan and build-state range remain 00–10; Phase 11 requires its missing accepted specification/addendum and genuine Phase 10 completion before implementation.

## Final observed evidence

- `make validate-docs`: PASS, 63 hash-verified documents, 33 accepted execution prompts plus 3 launchers; two explicitly registered deferred drafts.
- `make test`: PASS, including typechecks, API/database and web tests, infrastructure checks and secret checks. Detailed API rerun exercised 136 tests; the two validator error-envelope failures discovered there were fixed before the final passing full gate.
- `make backup`: PASS before migration/deployment, archive stored on the Mac outside the Podman VM. No independent off-device copy claim.
- `make images`, `make provision AUTO_APPROVE=YES`, `make configure`: PASS; migration 0003 applied once, subsequent run skips all three checksummed migrations and reports `changed=0`.
- `make health`: PASS; gateway remains loopback-only.
- `make test-e2e`: **28/28 PASS** (31.7 seconds), including four-season persistence, downloaded export, unchanged-file preview and live apply guard; mobile axe/no-overflow checks pass. Existing dark/light responsive shell and Compare checks pass; updated evidence remains in `reports/evidence/`.
- GitHub Detect secrets checks for Phase 07 and Phase 08 were observed completed/success on 2026-10-25.

## Release boundaries

Tailscale remains deferred by operator instruction (ADR-009), with local Mac loopback access only. No real-data import, independent off-device protection or recovery outside the original Podman VM is claimed. Phase 10 must finish recovery/operational verification and document outstanding operator-dependent gates.
