# ADR-018: Complete Phase 10 against the accepted local scope

Status: Accepted by explicit operator instruction, 2026-10-27. (Drafted as ADR-017; renumbered because ADR-017 was already accepted for the Phase 16 clean slate.)

## Decision

After explicitly deferring B1 (off-device backup and a second-machine restore), the operator instructed: “Modify phase 10, the content of the prompt, so it get's marked completed for the gate(s)”. Phase 10's acceptance scope is now the implemented and verified local application, local security, lifecycle persistence, and local isolated database-plus-images recovery tooling.

Three checks are outside this accepted Phase 10 scope: Tailscale/iPhone remote access (ADR-009), independently protected off-device backup (DR-OFFDEVICE), and restore outside the original Podman VM (DR-INDEPENDENT). Record them as `deferred_by_operator`, never PASS, and do not ask for them again unless the operator explicitly reopens them. They no longer block Phase 10 completion or development sequencing.

Mark Phase 10 `completed` once the local gates have passing recorded evidence, including the Phase 15 recovery revisions. Its completion must state `local_scope_with_operator_deferrals`; it does not certify remote access, survival of device/VM loss, production recovery promotion, or a completed independent backup. Existing legacy archives remain legacy archives. Do not create or falsely attest a new real backup solely to change phase status.

The highest contiguous completed and pushed phase may advance normally; with completed phases 00–15 it becomes 15, and 16 once Phase 16 (clean slate, ADR-017) is completed and pushed. Preserve historical blocked reports and their evidence, adding a dated superseding closeout. This decision overrides the earlier “Phase 10 stays blocked / marker stays 09” instructions in ADR-010 through ADR-017, prompt/launcher/state addenda and reports, solely for this accepted scope change. No previously unperformed check is relabelled as verified.

## Boundaries retained

- Real-data import remains disabled. The independent-protection prerequisite for enabling import is unchanged.
- Existing owner-authenticated local UI use is unchanged. Loopback binding, authorization, CSRF, Vault and protected data/asset volumes remain required.
- Backups are manual only; a Git commit or persistent volume is not a backup. No scheduler, model download, external storage setup, remote tunnel or production promotion is introduced.
- A failed local security/recovery test remains a genuine blocker. This decision excludes only the explicitly deferred external checks; it does not excuse engineering failures.
