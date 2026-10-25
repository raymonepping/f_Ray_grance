# Phase 06 — Collection, historical ownership and samples

Prompt: FRAY-CODEX-06. Agent: Codex, resuming Claude's unfinished Phase 06. Date: 2026-10-25.

## Takeover and predecessor verification

The operator explicitly authorized takeover and verification of prior work. `git ls-remote origin refs/heads/main` confirmed Phase 05 commit `a7d8b4e728486fbf5ee51c30fa7efff3dea420d0` on the configured `raymonepping/f_Ray_grance` main. Claude's existing process had no active child commands. Its Phase 06 lock had no PID; retained outside Git for audit and replaced with a Codex lock. Existing Phase 06 changes were preserved and reviewed. Unrelated untracked agent/editor configuration was excluded.

## Implemented and repaired

- Completed Claude's collection repository/API, expand-only migration 0002 for owner-scoped idempotent creation, owner isolation, status filters/search/sort, repeat purchases, ratings and private notes, barcode variants and append-only history.
- Finished the mobile collection interface, sample promotion, history timeline, explicit server-acknowledged saves and guarded synthetic E2E cleanup.
- **Prior-work defect found:** Phase 05 referenced `FragranceFragranceCard`, but Nuxt registers `FragranceCard`. Empty-collection tests did not expose it. A real saved sample rendered a blank list row. Corrected the component reference; mobile E2E now verifies actual cards.
- Prevented stale collection responses from replacing newer search/filter results; cleared pending timers on unmount.
- Preserved unsaved private-note/rating drafts when another action updates the entry status. Browser regression verifies the draft survives status promotion.
- Fixed whitespace-sensitive selectors in unfinished E2E tests. These failures were diagnosed rather than waived.

## Observed verification

- `make test`: PASS, including documentation/prompt validation, shell/Python checks, Terraform formatting/validation, Ansible syntax, gitleaks, workspace typechecks, and API/UI unit/integration tests on disposable PostgreSQL 18.
- `make heal`: PASS. `make backup`: completed checksummed manual off-VM archive before deployment. No off-device-copy or independent-VM recovery claim.
- `make images` and `make provision AUTO_APPROVE=YES`: PASS; only replaceable web container changed on final deployment; data root unchanged.
- `make configure`: PASS, `changed=0`, schema migrations 0001 and 0002 already applied and checksummed.
- `make health`: PASS, PostgreSQL 18.6/pgvector 0.8.7, durable PGDATA, Vault unsealed, API ready, loopback gateway.
- Initial browser tests exposed the blank-card bug; after repair and test-selector fixes, `make test-e2e`: **19/19 PASS**. Includes all 14 Phase 05 tests and five Phase 06 mobile flows, axe checks, both themes and 390/768/1280/1440 shell viewports.
- Integration tests verify concurrent retry idempotency, owner isolation, cross-fragrance variant rejection, barcode collisions, history accuracy and collection availability with a deliberately offline Scento client.

## Safety, limitations and handoff

No real personal collection was imported. Test owners and their synthetic collection history are removed by a name-restricted operator cleanup script. PostgreSQL/Vault volumes and unrelated stacks are preserved. Existing manually created accounts are untouched. Browser tests use Chromium; real iPhone Safari, Tailscale restrictions and independently protected off-device recovery remain Phase 10 requirements. State is updated atomically and committed with this report; remote CI is reported separately from push success.

Next: Phase 07, source-aware DNA and exactly two-fragrance Compare, after this phase's push is verified.

Additional takeover verification: live `scripts/probes/p03_live_security.sh` returned **39 PASS, 0 FAIL**, including scoped policies, runtime DDL denial, lease revoke/rotation/outage recovery, login/CSRF/logout and redacted-log checks.
