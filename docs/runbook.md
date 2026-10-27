# F-Ray-grance operator runbook

All commands run from the repository root on the Mac. `make help` lists every target.
Nothing here schedules anything: backups and restore tests are manual (ADR-007).

## Where things live (never in Git)

| Path | Contents | Protect it |
|---|---|---|
| `~/.config/f-ray-grance/vault-init.json` (0600) | fray-vault **unseal key** (root token is revoked after bootstrap) | Copy to your password manager / offline media. Losing it makes Vault data unrecoverable. |
| `~/.config/f-ray-grance/operator-token` (0600) | Scoped `fray-operator` Vault token (periodic 32 days, renewed by every `make configure`) | Same as above |
| `~/.config/f-ray-grance/secrets/pg_superuser` | PostgreSQL bootstrap password (only used at first init; superuser has no network login) | Keep with the above |
| `~/.local/state/f-ray-grance/terraform/` | Terraform state for the data and app roots | Back up with your Mac; treat as sensitive |
| `~/F-Ray-grance-backups/` (0700) | Manual `pg_dump` archives, manifests, image archives (`*.images.tar` + `.json`), restore-test results | Copy off-device after each `make backup` |
| `fraygrance_image_assets` volume | Perfume image originals and display derivatives, mounted in `fray-api` at `/var/lib/fray/images`. Metadata is in PostgreSQL | A volume is not a backup: `make backup` archives it next to the dump |
| `~/.local/share/f-ray-grance/toolchain/` | Project-local Node 24 | Re-creatable with `make toolchain` |

## First-time setup

```bash
make toolchain deps        # Node 24 + npm workspace (project-local)
make up                    # images, bootstrap, provision, configure, health
make vault-init            # ONE-TIME: initialise fray-vault (writes the unseal key file)
make vault-bootstrap       # ONE-TIME: scoped operator token, initial root token revoked
make up                    # second pass: Vault engines/policies, agent, API, migrations
make owner-create USERNAME=<you> DISPLAY_NAME="Your Name"   # prompts for a password (min 12)
make health
```

The app is then served on `http://localhost:8470` (loopback only). Use `localhost`, not
`127.0.0.1`, for local browser access; remote iPhone access is deferred by the operator under ADR-009 because of enterprise network policy.

## Day to day

| Situation | Command |
|---|---|
| Start / stop (volumes kept) | `make start` / `make stop` |
| **After the Mac slept** or the API reports not ready | `make heal` — fixes Podman VM clock drift, unseals Vault, re-renders Vault Agent credentials |
| Status, logs | `make status`, `make logs SERVICE=api` |
| Idempotency / drift check | `make drift` |
| Forgot password | `make owner-reset-password USERNAME=<you>` (also signs out all sessions) |
| Sign out everywhere | `make owner-revoke-sessions USERNAME=<you>` |
| Store or rotate the TinyFish key (web research, web image search) | `make tinyfish-key` (hidden prompt; empty clears), then `make recreate SERVICE=vault-agent` to apply at once |
| Store or rotate the ScentRev key (second fragrance source, ADR-020) | `make scentrev-key` (hidden prompt; empty clears), then `make recreate SERVICE=vault-agent` to apply at once. Generating a new key at ScentRev revokes the old one, so store the new key right away. |
| Start from scratch (empty personal data, keep the account) | `make purge USERNAME=<you>` or `make purge ALL=YES` |
| Clean slate (empty everything recorded, including the fragrance catalogue; keep the account) | `make clean-slate` |
| Manual backup + rehearsal | `make backup`, copy off-device, `make backup-record-copy BACKUP=… LOCATION="…"`, `make restore-test`, `make backup-status` |

## Starting from scratch: `make purge`

`make purge USERNAME=<name>` empties one owner's personal data; `make purge ALL=YES` does it for every owner. It removes collection entries with their history, ratings, private notes, seasons, Academy progress, Train My Nose practice, perfume image records (the files themselves are collected by the next `make backup` once no record uses them, ADR-016), the owner's own catalogue corrections, sessions and login counters. It **keeps** the owner account and password, the schema, the shared catalogue (verified fragrances, Scento observations, embeddings) and Vault. Nothing is dropped or recreated.

It prints what will be emptied, asks you to type `EMPTY <name>` (or `EMPTY ALL OWNERS`), then takes a fresh `make backup` and stops if that fails. Undo is a restore from that backup through the recovery procedure (`docs/recovery.md`). Sign in again afterwards.

## A real clean slate: `make clean-slate`

`make purge` keeps the shared catalogue. `make clean-slate` (ADR-017) empties **everything recorded**: the personal data of every owner (as `make purge ALL=YES`) and the whole catalogue, meaning fragrances, brands, barcodes and variants, Scento and web-research observations and claims, notes and the note dictionary, trait scores and embeddings. It keeps only the owner accounts and passwords, the migration ledger and the six Academy lessons that ship with the schema. The schema, Vault, the containers and the image volume are untouched. Image files are no longer referenced and are collected by a `make backup` taken an hour or more later (ADR-016).

It refuses if any table in the database is not classified in `scripts/clean-slate.sh`. It prints every table's row count, asks you to type `CLEAN SLATE`, then takes a fresh `make backup` and stops if that fails. Everything is emptied in one transaction. Sign in again afterwards with the same password, and Discover adds fragrances back one exact identity at a time. Undo is a restore from that backup through the recovery procedure (`docs/recovery.md`).

The browser suite (`make test-e2e`) works on an empty catalogue. It adds the two identities it needs (Phantom in Red, Layton) through the normal exact-identity path, and afterwards removes every catalogue row it added that nothing references. On an existing catalogue, it refreshes the Scento observations of those two identities.

## Why `make heal` exists

When the Mac sleeps, the Podman VM pauses and its clock falls behind; chrony may stay anchored
on a stale source. After the clock jumps, Vault (wall clock) treats the API's database lease as
expired and revokes it, while Vault Agent's renewal timer (monotonic) has not fired yet, so the
API holds dead credentials and answers `503` (fails closed, no data at risk). `make heal`
restarts chronyd in the VM if drift exceeds 2 s and restarts `fray-vault-agent`, which
re-authenticates and renders fresh credentials; the API swaps its pool within seconds.
`make start` runs `heal` automatically.

Since 2026-10-26 the agent recovers by itself. A watchdog (`infra/config/vault-agent-watchdog.sh`, the agent container's entrypoint) compares wall-clock progress with `/proc/uptime` every 10 s. When the clock jumps more than 30 s (VM resumed or chrony stepped), it restarts the agent, which re-issues credentials within about 3 s. Verified live: jumps of 1,892 s and 1,190 s were each recovered in 2 to 3 s. `make heal` is still useful when the VM clock stays behind, because chrony sometimes refuses its sources for many minutes. Heal steps the clock, and the watchdog then refreshes the credentials.

## Vault model (ADR-008)

- `fray-api` holds **no Vault token**. `fray-vault-agent` logs in with AppRole (secret-id bound to
  the private `fraygrance` network CIDR) and renders `db-runtime.json` (5 min lease, max 4 h) and
  `session.json` (session-token HMAC key) into a volume the API mounts read-only.
- Migrations use a separate 10-minute `fray-migrator` lease issued to Ansible, revoked right after.
- Rotating the session HMAC key (new version of `kv/fray/session`) signs everyone out.
- Privileged changes use the `fray-operator` token. If it is lost, use
  `vault operator generate-root` with the unseal key, then `make vault-bootstrap` logic manually.

See [manual recovery and reviewed upgrades](recovery.md) for snapshot-consistent backups, quarantine restore, independent restore requirements and rollback boundaries.
