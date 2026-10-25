# F-Ray-grance control plane (v0.1.6 Phase 00 scaffold)
# Terraform = provision; Ansible = configure; Podman = runtime; Make = interface.
# Operational targets that depend on the future application infrastructure FAIL CLOSED.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

TF ?= terraform
ANSIBLE ?= ansible-playbook
PODMAN ?= podman
TF_SMOKE := infra/terraform/phase00
TF_APP := infra/terraform/app
TF_DATA := infra/terraform/data
ANSIBLE_SITE := ansible/site.yml
SERVICE ?= api
# These are planned names: foundation provisioner must actually use them.
START_ORDER := fray-postgres fray-ollama fray-api fray-web
STOP_ORDER := fray-web fray-api fray-ollama fray-postgres

.PHONY: help validate-docs doctor check-socket smoke-init smoke-plan smoke-up smoke-down init plan provision configure up \
 start stop down restart status logs health test backup backup-status restore restore-test upgrade destroy danger-destroy-data check-app check-ansible

validate-docs: ## Verify documentation, links, manifest and agent prompts
	@python3 scripts/validate_release.py
	@python3 scripts/validate_prompts.py

help: ## Show command catalog
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / { printf "  %-17s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo; echo 'Phase 00: smoke-* is a disposable Terraform/Podman provider test; not the app stack.'

# Doctor is strictly read-only.
doctor: ## Inspect installed prerequisites and local Podman connectivity
	@bash scripts/doctor.sh

check-socket: ## Require an explicitly operator-verified Podman socket for Terraform provider
	@test -n "$${PODMAN_DOCKER_HOST:-}" || { echo 'Set PODMAN_DOCKER_HOST=unix://<verified-Podman-socket> first.' >&2; exit 2; }
	@test "$${CONFIRM_PODMAN_SOCKET:-}" = YES || { echo 'Verify the socket belongs to Podman, then export CONFIRM_PODMAN_SOCKET=YES.' >&2; exit 2; }
	@case "$${PODMAN_DOCKER_HOST}" in unix://*) ;; *) echo 'Phase 00 supports only explicit local unix:// sockets.' >&2; exit 2;; esac
	@test -S "$${PODMAN_DOCKER_HOST#unix://}" || { echo 'Unix socket does not exist or is inaccessible.' >&2; exit 2; }
	@$(PODMAN) info >/dev/null

smoke-init: check-socket ## Initialize disposable provider compatibility test
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_SMOKE) init

smoke-plan: check-socket ## Preview disposable network+volume+container test
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_SMOKE) plan

smoke-up: check-socket ## Create disposable Podman provider compatibility resources
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_SMOKE) apply
	@$(PODMAN) inspect f-ray-grance-phase00-probe >/dev/null || { echo 'Terraform target is not visible in Podman. Check socket!' >&2; exit 2; }
	@echo 'PASS: Terraform-managed probe visible in Podman.'

smoke-down: check-socket ## Destroy only disposable Phase 00 probe resources
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_SMOKE) destroy

check-app:
	@test -f $(TF_APP)/main.tf || { echo 'Application Terraform root not yet implemented. Finish Phase 00. Protected data root is separate.' >&2; exit 2; }

check-ansible:
	@test -f $(ANSIBLE_SITE) || { echo 'Ansible site.yml not yet implemented. Complete Phase 00 and configuration roles.' >&2; exit 2; }

init: check-app check-socket ## Initialize the application Terraform root
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_APP) init

plan: check-app check-socket ## Preview Terraform infrastructure changes
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_APP) plan

provision: check-app check-socket ## Apply Terraform infrastructure changes
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_APP) apply

configure: check-ansible ## Run idempotent service configuration via Ansible
	@$(ANSIBLE) -i ansible/inventory.ini $(ANSIBLE_SITE)

up: doctor check-app check-ansible ## Provision -> configure -> health, fail fast
	@$(MAKE) provision
	@$(MAKE) configure
	@$(MAKE) health

start: ## Start only existing F-Ray-grance containers in dependency order
	@for c in $(START_ORDER); do \
	  if $(PODMAN) container exists "$$c"; then $(PODMAN) start "$$c"; \
	  else echo "Missing planned container $$c: provision first or update Makefile." >&2; exit 2; fi; \
	done

stop: ## Stop existing project containers, preserve all data volumes
	@for c in $(STOP_ORDER); do \
	  if $(PODMAN) container exists "$$c"; then $(PODMAN) stop "$$c"; fi; \
	done

down: stop ## Non-destructive alias for stop

restart: stop start ## Restart project services without deleting volumes

status: ## List only project-named containers, all states
	@$(PODMAN) ps -a --format '{{.Names}}  {{.Status}}' | grep -E '^(fray-|f-ray-grance-phase00-)' || echo 'No F-Ray-grance containers found.'

logs: ## View scoped service logs: make logs SERVICE=api
	@case "$(SERVICE)" in \
	  web) c=fray-web;; api) c=fray-api;; postgres) c=fray-postgres;; ollama) c=fray-ollama;; \
	  *) echo 'Use SERVICE=web|api|postgres|ollama' >&2; exit 2;; \
	esac; $(PODMAN) logs --tail=150 "$$c"

health: ## Execute configured integration health checks (not scaffolded yet)
	@test -x scripts/health.sh || { echo 'Health checks not implemented; do not claim stack ready.' >&2; exit 2; }
	@bash scripts/health.sh

test: ## Run app and infrastructure quality gate (not scaffolded yet)
	@test -x scripts/test.sh || { echo 'Test runner not implemented.' >&2; exit 2; }
	@bash scripts/test.sh

backup: ## MANUAL protected PostgreSQL backup (requires completed script)
	@test -x scripts/backup.sh || { echo 'Backup unavailable until implemented and tested.' >&2; exit 2; }
	@bash scripts/backup.sh

backup-status: ## Report last MANUAL off-VM backup (requires completed script)
	@test -x scripts/backup-status.sh || { echo 'Backup status not implemented. No protection claim can be made.' >&2; exit 2; }
	@bash scripts/backup-status.sh

restore-test: ## MANUAL isolated restore verification (requires completed script)
	@test -x scripts/restore-test.sh || { echo 'Restore rehearsal not implemented.' >&2; exit 2; }
	@bash scripts/restore-test.sh

upgrade: ## Backup-gated app and database migration (requires completed script)
	@test -x scripts/upgrade.sh || { echo 'Upgrade runbook not implemented. No image/tag change performed.' >&2; exit 2; }
	@bash scripts/upgrade.sh

restore: ## Explicit restore workflow (requires completed script)
	@test -x scripts/restore.sh || { echo 'Restore unavailable until implemented and tested.' >&2; exit 2; }
	@bash scripts/restore.sh

destroy: check-app check-socket ## Destroy only app Terraform resources, never data state
	@test "$${VERIFIED_BACKUP:-}" = YES || { echo 'Set VERIFIED_BACKUP=YES only after validating a recent restorable backup.' >&2; exit 2; }
	@read -r -p 'Type DESTROY F-RAY-GRANCE to proceed: ' answer; \
	  test "$$answer" = 'DESTROY F-RAY-GRANCE' || { echo 'Aborted'; exit 2; }
	@echo 'SAFETY BOUNDARY: this target may destroy only Terraform app root; DB volume/state and existing Vault are excluded.'
	@TF_VAR_podman_docker_host="$${PODMAN_DOCKER_HOST}" $(TF) -chdir=$(TF_APP) destroy

# Intentional fail-closed procedure. Never delete user data via routine Make targets.
danger-destroy-data: # Internal deny stub; not a regular help target
	@echo 'DENIED: destructive data removal is not implemented in the Phase 00 scaffold.' >&2
	@exit 2
