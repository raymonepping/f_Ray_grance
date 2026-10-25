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
| `~/F-Ray-grance-backups/` (0700) | Manual `pg_dump` archives, manifests, restore-test results | Copy off-device after each `make backup` |
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
| Manual backup + rehearsal | `make backup`, copy off-device, `make backup-record-copy BACKUP=… LOCATION="…"`, `make restore-test`, `make backup-status` |

## Why `make heal` exists

When the Mac sleeps, the Podman VM pauses and its clock falls behind; chrony may stay anchored
on a stale source. After the clock jumps, Vault (wall clock) treats the API's database lease as
expired and revokes it, while Vault Agent's renewal timer (monotonic) has not fired yet, so the
API holds dead credentials and answers `503` (fails closed, no data at risk). `make heal`
restarts chronyd in the VM if drift exceeds 2 s and restarts `fray-vault-agent`, which
re-authenticates and renders fresh credentials; the API swaps its pool within seconds.
`make start` runs `heal` automatically.

## Vault model (ADR-008)

- `fray-api` holds **no Vault token**. `fray-vault-agent` logs in with AppRole (secret-id bound to
  the private `fraygrance` network CIDR) and renders `db-runtime.json` (5 min lease, max 4 h) and
  `session.json` (session-token HMAC key) into a volume the API mounts read-only.
- Migrations use a separate 10-minute `fray-migrator` lease issued to Ansible, revoked right after.
- Rotating the session HMAC key (new version of `kv/fray/session`) signs everyone out.
- Privileged changes use the `fray-operator` token. If it is lost, use
  `vault operator generate-root` with the unseal key, then `make vault-bootstrap` logic manually.

See [manual recovery and reviewed upgrades](recovery.md) for snapshot-consistent backups, quarantine restore, independent restore requirements and rollback boundaries.
