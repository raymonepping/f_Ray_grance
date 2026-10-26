# Independent review of prompts 01–14

Reviewer: Codex. Date: 2026-10-26 (Europe/Amsterdam). Reviewed `main` at **08ee5364c49f121128e708d4af48657f3ea1d5cf**. Its presence on configured GitHub `origin/main` was verified with `git ls-remote`. This is a review and revision-prompt delivery, not execution of Phase 15.

## Conclusion

Most requested functionality is implemented by Claude and Codex and is running. **“All prompts successfully finished” is not supported.** Phase 10 is explicitly blocked, and targeted checks found recovery and identity defects outside the passing regression suite. Phase 13 also has a reproduced UI race and incomplete presentation requirements. Phase 14's navigation behavior passes. A new [15_revisions.md](../prompts/Claude/15_revisions.md) defines the fixes and acceptance evidence.

Existing phase completion markers describe historical acceptance. This review records current findings separately instead of rewriting those historical results or claiming Phase 15 has run. `last_successful_phase` correctly remains 09 while Phase 10 is open.

## Per-prompt assessment

| Prompt | Delivered by | Current assessment and evidence |
|---|---|---|
| 01 Infrastructure/persistence | Claude | Implemented. Terraform data/app split, protected volumes and Make/Ansible control plane exist; current static infrastructure checks pass and both roots show NO_DRIFT. Prior lifecycle evidence is in reports 01 and 10; destructive/rebuild drills were not repeated against the owner's now-used app. |
| 02 Schema/API | Claude | Implemented. Seven forward migrations, schema/GTIN/variant/ownership tests and API health. Current disposable-database tests and typechecks pass. Historical backup compatibility now needs R3. |
| 03 Vault/authentication | Claude, subsequent fixes by both agents | Implemented. Current health confirms ready API and running Vault/Agent; current auth/owner/CSRF tests pass. Historical live security probes recorded 39/39. This review did not revoke live leases or stop Vault. |
| 04 Exact identity/provenance | Claude | Core Scento adapter/resolver implemented with negative identity fixtures and correction-preservation tests. Later ADR-013 web research weakens exact identity: R4 is required. |
| 05 Responsive shell/design | Claude, later Claude redesign under ADR-012 | Implemented. Existing shell/browser/theme/accessibility coverage passes. The accepted Spectrometer redesign supersedes the original navy/gold appearance; that design change is not a missing feature. |
| 06 Collection/history/samples | Codex completing Claude's draft; later Claude enhancements | Implemented. Current CRUD/history/variant/removal integration and browser coverage passes. No real owner records were changed by review tests. |
| 07 DNA/two-fragrance Compare | Codex, later integration by Claude | Implemented. Structured DNA, exactly-two comparison, sourced/untiered notes and mobile/theme browser checks pass. |
| 08 Embeddings/discovery | Codex | Implemented. Pinned model/revision/dimension, stale-source checks, explicit-preference ranking and offline-fallback tests pass. No generative model is required for discovery. |
| 09 Seasons/portability | Codex, Academy extension by Claude | Implemented. Four-season UI/API, owner isolation, version 1/2 JSON validation and additive roundtrip tests pass. Images are intentionally excluded from portable JSON under the accepted image spec; that is not itself an export defect. Full recovery depends on fixing R1–R3. |
| 10 Release/security/recovery | Codex, image recovery additions by Claude | **Not complete: state says blocked.** Independent protected copy and restore outside the original VM remain unverified. The implemented recovery tooling additionally has reproduced failures R1/R3 and the cross-store consistency gap R2. Tailscale is deferred by operator instruction, not failed implementation. |
| 11 Scent Academy | Codex initial scope/WIP, completed by Claude | Implemented: six lessons, versioned progress, owner-scoped resumable practice, educational references, portability and honest unavailable-tutor state. Current Academy browser/API coverage passes. A configured generative tutor is conditional; its absence is an operator option, not a missing mandatory feature. |
| 12 Perfume images | Claude | Implemented: source precedence, persistent assets, ingestion/SSRF guards, primary selection, durable failures and images across app surfaces. Current image tests pass. **Recovery is incomplete/unsafe to certify until R1/R2 and an actual isolated asset restore are resolved.** The original report acknowledges extraction into a fresh volume was not exercised. |
| 13 My Spectrum | Claude | Core owner-scoped calculation, scope filtering, unknown handling and descriptive UI implemented; current unit/API/browser tests pass. **R6/R7 remain:** reproduced stale-scope response, decorative ticks and missing single-fragrance qualification. |
| 14 Sidebar order/dividers | Claude | Implemented: grouped source, ordered sidebar/rail/drawer, utility Settings and unchanged four-route bottom navigation. Current sidebar browser tests pass. Prompt-catalog/documentation integration needs R5. |

The untracked Codex copies of prompts 13 and 14 differ from the accepted Claude versions only in agent/title/ID. They do not introduce additional feature requirements, but currently break validation because the catalog accepts 13/14 for Claude only.

## Verification actually performed

- `make test`: **FAIL overall**. Its documentation stage rejects the pre-existing untracked `prompts/Codex/13_add_spectrum.md` and `prompts/Codex/14_reorder_sidebar.md` as frozen documents missing from the manifest. Every other reported stage passed: shell/Python checks, Terraform fmt/validate, Ansible syntax, secret/state restrictions, secret scan, workspace typechecks and disposable PostgreSQL API/web tests. Do not describe the overall gate as green.
- GitHub Detect secrets for the reviewed Phase 14 SHA: **completed/success**, observed through the connected GitHub API. This is separate from the failing local documentation gate.
- `make health`: **PASS**, including PostgreSQL 18/pgvector, Vault, ready API, image volume and loopback-only gateway.
- `make drift`: **NO_DRIFT** in both data and app roots.
- `make test-e2e`: **49/49 PASS** in 1.3 minutes, including Academy, images, collection/removal, Compare, discovery, seasons, Spectrum, responsive themes and grouped navigation.
- Targeted restore reproductions: private temporary copies of existing project backups, separate disposable no-network containers, original backups untouched. No receipt was written into the real backup directory by these negative tests.
- Deterministic domain/browser reproductions used synthetic data and mock responses. No TinyFish request or other paid research call was made for the identity reproduction.

Browser tests regenerate versioned evidence; review-generated changes were restored to their initially clean HEAD versions. Unrelated untracked agent directories, `article/`, and Codex prompt copies were preserved. No application source change or remediation was made during this review.

## Findings requiring revisions

### R1 — P1: failed image recovery leaves a successful receipt

**Locations:** `scripts/restore-test.sh` lines 83–113, `scripts/backup_manifest.py` compare, `scripts/backup-status.sh` restore-receipt selection.

The PostgreSQL comparison writes a persistent `result: PASS` receipt and prints `RESTORE_TEST_PASS` **before** image archive checks. A later missing/corrupt image archive fails the command, but leaves that success receipt eligible for backup-status reporting. The independent-recovery attestation fields can be written at the same premature point.

**Reproduced:** a private copy of the schema-5 project fixture backup plus corrupted image tar exited 2, printed `RESTORE_TEST_FAIL: image archive checksum mismatch`, yet its persisted receipt contained `PASS`. A correctly checksummed empty tar with database references likewise exited 2 for missing files after persisting `PASS`.

Write the overall receipt only after all required stores/checks pass. Persist an explicit failure when any stage fails; bind database and asset checksums to the receipt and status/copy attestations. See R1 acceptance in prompt 15.

### R2 — P1: database snapshot and image archive are not one consistent backup

**Locations:** `scripts/backup.sh` lines 6, 35–58; `apps/api/src/routes/v1/images.ts` lines 449–455; asset refresh around lines 417–424; `scripts/restore-test.sh` image verification.

The backup comment claims that archiving images after the database dump creates a superset. That assumption is false when an image is deleted after the database snapshot but before the tar reads the volume: the delete path immediately removes unreferenced files. There is no shared backup/mutation coordination. A backup can therefore be published as complete while its snapshot references absent bytes. This is a code-path finding; a concurrent-delete stress test against the live owner was intentionally not performed.

**Related reproduction:** a valid, correctly checksummed tar with no files paired with the image-referencing fixture database cannot restore its references. Merely checking archive filenames does not exercise extraction/readability from a fresh asset store. The Phase 12 report explicitly says actual extraction into a new volume was not tested.

Introduce a coherent database/assets snapshot or retention/locking protocol, verify referenced originals and derivatives before advertising completion, and exercise a fresh isolated asset restore with bytes/checksums/owner-scoped reads. Extend off-device status to the complete backup set rather than the dump alone.

### R3 — P1: accepted legacy backups fail the current restore smoke test

**Locations:** `scripts/restore-test.sh` compatibility gate and image-reference query; `scripts/sql/restore_smoke.sql` lines 24–38.

The compatibility gate accepts every schema version from 1 through the current migration count. The smoke SQL unconditionally accesses Academy and image tables introduced in migrations 4 and 5. Its later static image-table query also cannot safely reference an absent relation merely by wrapping it in a CASE.

**Reproduced:** a private copy of the known schema-3 archive `fray-20261025T095344Z.dump` was accepted by preflight, restored, and failed on `INSERT INTO app.academy_progress` because that relation does not exist. This breaks the pre-upgrade recovery path promised by earlier phases.

Support version-aware checks and explicit migration/validation of a fresh restored target, or reject genuinely unsupported versions clearly before restore while documenting the matching-version recovery route. Preserve support for known retained checkpoints; never rewrite applied migrations or migrate the authoritative database as a test.

### R4 — P1: web research can accept a flanker as an exact match

**Locations:** `apps/api/src/domain/research.ts` `namesExactly`, `selectPages`, `validateFinding`; `apps/api/src/images/lookup.ts` reuse of the same helper. Related to Phase 04 and accepted ADR-013.

A contiguous name phrase is not an exact product identity. The later concentration guard fixes the reported EDT/EDP case but does not reject all flankers, additional product suffixes or brand mismatches.

**Reproduced without an external call:** `namesExactly('Dior Sauvage Very Cool Spray', 'Sauvage')` is true. `validateFinding` with `exact_match: true`, that product name, target `Sauvage`, known `eau_de_toilette` and synthetic year/note fields returns proposals with `rejected: null`. Those are details of another variant. User review and low-trust labels reduce automation risk but do not make the exact-match assertion correct.

Pass the complete trusted identity through all research/image selection stages, reject contradictions independently of the agent's boolean, and keep uncertain candidates labelled for review without presenting/saving their facts as exact-target enrichment. Preserve original source claims and history.

### R5 — P2: the current documentation gate fails and operator status is stale

**Locations:** `scripts/prompt_catalog.py`, `spec/MANIFEST.json`, `scripts/validate_prompts.py`, `scripts/validate_release.py`, root `README.md`.

The existing untracked Codex 13/14 files fail the frozen-doc inventory; simply rehashing also leaves the strict expected-phase set wrong. Do not silently delete, ignore or stage those user files. Reconcile their accepted registration deliberately. Validator output hardcodes obsolete prompt totals. README still claims Phase 11 is a deferred draft with no specification even though phases 11–14 have been accepted, built and pushed.

Repair the registry/manifest/launcher/README contract and derive counts from actual accepted files. Keep historical reports intact, show Phase 10 as blocked, and register any newly executable Phase 15 without claiming it has run. This review deliberately leaves these pre-existing files unchanged and places the requested prompt at repository root to avoid implicitly registering a new implementation phase.

### R6 — P2: out-of-order Spectrum responses overwrite the selected scope

**Location:** `apps/web/app/pages/spectrum/index.vue` `load` and `watch(scope, ...)`.

There is no cancellation or request-generation check. A slower sample-inclusive response can overwrite the newer owned-only result.

**Reproduced in the running browser using entirely synthetic intercepted responses:** requested `owned_and_samples` (450 ms delay), then `owned` (30 ms). The final Owned button had `aria-pressed=true` while the readout showed 02, the sample-inclusive count; owned-only count was 01.

Accept a result/error only when it still belongs to the active scope/request, and make loading state truthful. Add a deterministic browser regression that delivers responses in reverse order.

### R7 — P2: Spectrum presentation misses explicit Phase 13 acceptance items

**Locations:** `apps/web/app/components/spectrum/SpectrumAxis.vue` lines 30–61; `spec/SPECTRUM_SPEC.md` Presentation and Spectrums.

The visual tick track is `aria-hidden` and its fragrance marks are `<span>` elements. Only the separate list below links to detail. This supplies an accessible fallback, but does not implement the explicitly requested linked ticks. The component also does not state “based on one fragrance” when exactly one fragrance is placed, as the spec requires. The report/source comment overstates the tick behavior. Tick overlap is already acknowledged in the Phase 13 report.

Add identifiable, operable tick/detail interaction with keyboard/touch access and overlapping-point handling, retain the sorted text list, and add the single-fragrance qualification. Test 320 px, both themes, one/zero/multiple placed fragrances and equal positions.

## Existing operator-dependent release work (B1)

State continues to record DR-OFFDEVICE and DR-INDEPENDENT. There is no supplied protected off-device destination or approved separate restore environment in this review. Phase 10 must remain blocked, import disabled, and Tailscale deferred per ADR-009. Resolve engineering findings first; then verify the full database-plus-images recovery set on an approved independent target. No invented receipt, attestation or change of status may substitute for that evidence.

The optional generative tutor and optional real remote image-host checks remain configuration/live-integration boundaries, with honest fallbacks already present. They are not reasons to download models, approve domains, enable tunnels or send private data during revisions.
