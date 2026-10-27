# F-Ray-grance control plane.
# Terraform = provision; Ansible = configure; Podman = runtime; Make = interface.
# Data-destroying actions are never part of a normal target (ADR-003, ADR-007).
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

include infra/versions.mk

TF ?= terraform
ANSIBLE ?= ansible-playbook
PODMAN ?= podman
ANSIBLE_SITE := ansible/site.yml
SERVICE ?= api

# Operator-local, never in Git. Override via environment if desired.
FRAY_CONFIG_DIR ?= $(HOME)/.config/f-ray-grance
FRAY_SECRETS_DIR ?= $(FRAY_CONFIG_DIR)/secrets
FRAY_STATE_DIR ?= $(HOME)/.local/state/f-ray-grance
FRAY_BACKUP_DIR ?= $(HOME)/F-Ray-grance-backups
VAULT_INIT_FILE ?= $(FRAY_CONFIG_DIR)/vault-init.json
# Project-local Node 24 LTS (scripts/toolchain.sh); host default node is untouched.
FRAY_NODE_BIN ?= $(HOME)/.local/share/f-ray-grance/toolchain/node-v24.21.0-darwin-arm64/bin
export PATH := $(FRAY_NODE_BIN):$(PATH)

WEB_IMAGE ?= $(shell $(PODMAN) image exists localhost/fray-web:current 2>/dev/null && echo localhost/fray-web:current || echo localhost/fray-web:placeholder)
# fray-api is provisioned only once Vault Agent can deliver its DB credentials (Phase 03).
API_IMAGE ?= $(if $(filter true,$(VAULT_AGENT_ENABLED)),$(shell $(PODMAN) image exists localhost/fray-api:current 2>/dev/null && echo localhost/fray-api:current))
VAULT_AGENT_ENABLED ?= $(shell test -f $(FRAY_CONFIG_DIR)/vault-configured && echo true || echo false)

export TF PODMAN FRAY_CONFIG_DIR FRAY_SECRETS_DIR FRAY_STATE_DIR FRAY_BACKUP_DIR VAULT_INIT_FILE
export PG_IMAGE VAULT_IMAGE OLLAMA_IMAGE CADDY_IMAGE NODE_IMAGE EMBED_MODEL WEB_IMAGE API_IMAGE VAULT_AGENT_ENABLED

START_ORDER := fray-postgres fray-vault fray-ollama fray-vault-agent fray-api fray-web
STOP_ORDER := fray-web fray-api fray-vault-agent fray-ollama fray-vault fray-postgres
APPROVE := $(if $(filter YES,$(AUTO_APPROVE)),-auto-approve,)

.PHONY: help toolchain deps validate-docs doctor check-socket smoke-init smoke-plan smoke-up smoke-down images build bootstrap \
 init plan drift recreate provision configure up start stop down restart status logs clock-sync heal health test test-e2e \
 owner-create owner-reset-password owner-revoke-sessions vault-init vault-unseal vault-bootstrap vault-status tinyfish-key scentrev-key noteboxd-key vault-snapshot \
 backup backup-status backup-record-copy purge clean-slate restore-test restore upgrade destroy danger-destroy-data check-app check-ansible

help: ## Show command catalog
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / { printf "  %-19s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo; echo 'Terraform state: $(FRAY_STATE_DIR)/terraform (outside Git). Backups: $(FRAY_BACKUP_DIR) (manual only).'

validate-docs: ## Verify documentation, links, manifest and agent prompts
	@python3 scripts/validate_release.py
	@python3 scripts/validate_prompts.py

# Doctor is strictly read-only.
doctor: ## Inspect installed prerequisites and local Podman connectivity
	@PODMAN_DOCKER_HOST="$${PODMAN_DOCKER_HOST:-$$(bash scripts/podman_socket.sh 2>/dev/null || true)}" bash scripts/doctor.sh

check-socket: ## Prove the Podman API socket identifies as Podman Engine
	@bash scripts/podman_socket.sh >/dev/null

# ---------------------------------------------------------------- Phase 00 probe
smoke-init: check-socket ## Initialize disposable provider compatibility test
	@bash scripts/tf.sh phase00 init

smoke-plan: check-socket ## Preview disposable network+volume+container test
	@bash scripts/tf.sh phase00 plan

smoke-up: check-socket ## Create disposable Podman provider compatibility resources
	@bash scripts/tf.sh phase00 apply $(APPROVE)
	@$(PODMAN) inspect f-ray-grance-phase00-probe >/dev/null || { echo 'Terraform target is not visible in Podman. Check socket!' >&2; exit 2; }
	@echo 'PASS: Terraform-managed probe visible in Podman.'

smoke-down: check-socket ## Destroy only disposable Phase 00 probe resources
	@bash scripts/tf.sh phase00 destroy $(APPROVE)

# ---------------------------------------------------------------- toolchain, images and bootstrap
toolchain: ## Install/verify project-local Node 24 LTS (nodejs.org, checksum-verified)
	@bash scripts/toolchain.sh

deps: toolchain ## Install npm workspace dependencies from the lockfile
	@npm ci --no-audit --no-fund

images: ## Pull pinned arm64 images and build project images (podman --format docker)
	@bash scripts/images.sh

build: images ## Alias for images

bootstrap: ## Create operator-local dirs and the PostgreSQL bootstrap secret file (never in Git)
	@bash scripts/bootstrap.sh

check-app:
	@test -f infra/terraform/app/main.tf || { echo 'Application Terraform root missing.' >&2; exit 2; }

check-ansible:
	@test -f $(ANSIBLE_SITE) || { echo 'Ansible site.yml missing.' >&2; exit 2; }

init: check-app check-socket ## Initialize data and app Terraform roots (state outside Git)
	@bash scripts/tf.sh data init
	@bash scripts/tf.sh app init

plan: check-app check-socket ## Preview data and app changes (never applies)
	@bash scripts/tf.sh data plan -input=false
	@bash scripts/tf.sh app plan -input=false

drift: check-app check-socket ## Exit non-zero if Terraform would change anything (idempotency check)
	@for r in data app; do \
	  rc=0; bash scripts/tf.sh $$r plan -detailed-exitcode -input=false -no-color >/dev/null || rc=$$?; \
	  case $$rc in 0) echo "NO_DRIFT $$r";; 2) echo "DRIFT $$r (run make plan)"; exit 2;; *) echo "PLAN_ERROR $$r"; exit 1;; esac; \
	done

provision: check-app check-socket ## Apply data root (volumes) then app root (network, containers)
	@test -f "$(FRAY_SECRETS_DIR)/pg_superuser" || { echo 'Run make bootstrap first.' >&2; exit 2; }
	@bash scripts/tf.sh data apply -input=false $(APPROVE)
	@bash scripts/tf.sh app apply -input=false $(APPROVE)

recreate: check-app check-socket ## Replace ONE container (volumes kept): SERVICE=postgres|vault|ollama|web|api|vault-agent
	@case "$(SERVICE)" in \
	  postgres|vault|ollama|web) r="docker_container.$(SERVICE)";; api) r='docker_container.api[0]';; vault-agent) r='docker_container.vault_agent[0]';; \
	  *) echo 'Use SERVICE=postgres|vault|ollama|web|api|vault-agent' >&2; exit 2;; \
	esac; bash scripts/tf.sh app apply -replace="$$r" -input=false $(APPROVE)
	@if [[ "$(SERVICE)" == vault ]] && test -f "$(VAULT_INIT_FILE)"; then $(MAKE) --no-print-directory vault-unseal; fi

configure: check-ansible ## Run idempotent service configuration via Ansible
	@cd ansible && $(ANSIBLE) site.yml </dev/null

up: doctor check-app check-ansible ## images -> bootstrap -> provision -> unseal -> configure -> health
	@$(MAKE) images
	@$(MAKE) bootstrap
	@$(MAKE) provision
	@if test -f "$(VAULT_INIT_FILE)"; then $(MAKE) vault-unseal; else echo 'NOTICE: Vault not initialised yet: run make vault-init (one-time).'; fi
	@$(MAKE) configure
	@# Second pass once Vault is configured: Terraform adds fray-vault-agent + fray-api,
	@# Ansible delivers AppRole credentials, migrates with a Vault-issued migrator lease.
	@if test -f "$(FRAY_CONFIG_DIR)/vault-configured" && ! $(PODMAN) container exists fray-api; then \
	  $(MAKE) provision && $(MAKE) configure; fi
	@$(MAKE) health

# ---------------------------------------------------------------- runtime lifecycle (volumes untouched)
start: ## Start only existing F-Ray-grance containers in dependency order
	@for c in $(START_ORDER); do \
	  if $(PODMAN) container exists "$$c"; then $(PODMAN) start "$$c" >/dev/null && echo "started $$c"; \
	  elif [[ "$$c" == fray-postgres || "$$c" == fray-web ]]; then echo "Missing required container $$c: run make provision." >&2; exit 2; \
	  else echo "skip $$c (not provisioned)"; fi; \
	done
	@if test -f "$(VAULT_INIT_FILE)"; then $(MAKE) --no-print-directory heal; fi

stop: ## Stop existing project containers, preserve all data volumes
	@for c in $(STOP_ORDER); do \
	  if $(PODMAN) container exists "$$c"; then $(PODMAN) stop -t 15 "$$c" >/dev/null && echo "stopped $$c"; fi; \
	done

down: stop ## Non-destructive alias for stop

restart: stop start ## Restart project services without deleting volumes

status: ## List only project-labelled containers and volumes
	@$(PODMAN) ps -a --filter label=io.fraygrance.project=fraygrance --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -v 'phase00' || echo 'No F-Ray-grance containers found.'
	@echo '--- volumes'; $(PODMAN) volume ls --filter label=io.fraygrance.project=fraygrance --format '{{.Name}}'

logs: ## View scoped service logs: make logs SERVICE=api|web|postgres|ollama|vault|vault-agent
	@case "$(SERVICE)" in \
	  web) c=fray-web;; api) c=fray-api;; postgres) c=fray-postgres;; ollama) c=fray-ollama;; \
	  vault) c=fray-vault;; vault-agent) c=fray-vault-agent;; \
	  *) echo 'Use SERVICE=web|api|postgres|ollama|vault|vault-agent' >&2; exit 2;; \
	esac; $(PODMAN) logs --tail=150 "$$c"

clock-sync: ## Fix Podman VM clock drift (restarts chronyd in the VM if drift > 2 s)
	@bash scripts/heal.sh clock

heal: ## After Mac sleep: clock-sync, unseal, re-render Vault Agent credentials if the API is not ready
	@bash scripts/heal.sh all

health: ## Integration health checks; exits non-zero on any failed required check
	@bash scripts/health.sh

test: ## Static + infrastructure + application quality gate
	@bash scripts/test.sh

test-e2e: ## Browser E2E (Playwright) against the running stack; keeps the Mac awake while it runs
	@$(MAKE) --no-print-directory heal
	@cd apps/web && caffeinate -i npx playwright test

# ---------------------------------------------------------------- owner accounts (no public sign-up)
owner-create: ## Create the app owner: USERNAME=<name> [DISPLAY_NAME="..."] (password prompted, never echoed)
	@bash scripts/owner.sh create "$(USERNAME)" "$(DISPLAY_NAME)"

owner-reset-password: ## Reset an owner's password and revoke their sessions: USERNAME=<name>
	@bash scripts/owner.sh reset-password "$(USERNAME)"

owner-revoke-sessions: ## Sign an owner out everywhere: USERNAME=<name>
	@bash scripts/owner.sh revoke-sessions "$(USERNAME)"

# ---------------------------------------------------------------- Vault (ADR-008)
vault-init: ## ONE-TIME: initialise fray-vault; keys go only to the operator file (0600)
	@bash scripts/vault.sh init

vault-unseal: ## Unseal fray-vault from the operator file (no secret in process args)
	@bash scripts/vault.sh unseal

vault-bootstrap: ## ONE-TIME: create scoped fray-operator token, then revoke the initial root token
	@bash scripts/vault.sh bootstrap

tinyfish-key: ## Store the TinyFish API key in fray-vault (hidden prompt or stdin; empty clears; never echoed)
	@bash scripts/vault.sh tinyfish-key

scentrev-key: ## Store the ScentRev API key in fray-vault (hidden prompt or stdin; empty clears; never echoed)
	@bash scripts/vault.sh scentrev-key

noteboxd-key: ## Store the NoteboxD API key in fray-vault (hidden prompt or stdin; empty clears; never echoed)
	@bash scripts/vault.sh noteboxd-key

vault-status: ## Show fray-vault initialised/sealed status
	@bash scripts/vault.sh status

vault-snapshot: ## MANUAL Raft snapshot of fray-vault to the backup directory
	@bash scripts/vault.sh snapshot

# ---------------------------------------------------------------- manual backups (ADR-007)
backup: ## MANUAL pg_dump -Fc to $(FRAY_BACKUP_DIR) with checksum + manifest
	@bash scripts/backup.sh

purge: ## EMPTY (not delete) personal data, keep accounts: USERNAME=<name> | ALL=YES (backs up first, typed confirmation)
	@if [[ "$(ALL)" == YES ]]; then bash scripts/purge-owner-data.sh --all; \
	 elif [[ -n "$(USERNAME)" ]]; then bash scripts/purge-owner-data.sh "$(USERNAME)"; \
	 else echo 'Use make purge USERNAME=<name> or make purge ALL=YES' >&2; exit 2; fi

clean-slate: ## EMPTY everything recorded (all owners' data AND the fragrance catalogue); keeps accounts (backs up first, typed confirmation)
	@bash scripts/clean-slate.sh

backup-status: ## Report last verified manual backup and recorded off-device copy
	@bash scripts/backup-status.sh

backup-record-copy: ## Record an operator-verified off-device copy: BACKUP=<file> LOCATION="<label>"
	@bash scripts/backup-status.sh record "$(BACKUP)" "$(LOCATION)"

restore-test: ## MANUAL isolated restore into a disposable PostgreSQL: [BACKUP=<file>]
	@bash scripts/restore-test.sh "$(BACKUP)"

upgrade: ## Reviewed app-only upgrade with backup/restore gates: AUTO_APPROVE=YES
	@test -x scripts/upgrade.sh || { echo 'Upgrade runbook not implemented. No image/tag change performed.' >&2; exit 2; }
	@bash scripts/upgrade.sh

restore: ## Explicit verified restore into a new quarantine target: BACKUP=/absolute/file.dump
	@test -x scripts/restore.sh || { echo 'Restore unavailable until implemented and tested.' >&2; exit 2; }
	@bash scripts/restore.sh "$(BACKUP)"

destroy: check-app check-socket ## Destroy only app Terraform resources, never the data root
	@test "$${VERIFIED_BACKUP:-}" = YES || { echo 'Set VERIFIED_BACKUP=YES only after validating a recent restorable backup.' >&2; exit 2; }
	@read -r -p 'Type DESTROY F-RAY-GRANCE to proceed: ' answer; \
	  test "$$answer" = 'DESTROY F-RAY-GRANCE' || { echo 'Aborted'; exit 2; }
	@echo 'SAFETY BOUNDARY: app root only; data volumes (data root) and their state are excluded.'
	@bash scripts/tf.sh app destroy -input=false -auto-approve # typed phrase above is the approval

# Intentional fail-closed procedure. Never delete user data via routine Make targets.
danger-destroy-data: # Internal deny stub; not a regular help target
	@echo 'DENIED: destructive data removal is not implemented.' >&2
	@exit 2
