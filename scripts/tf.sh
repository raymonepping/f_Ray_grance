#!/usr/bin/env bash
# Terraform wrapper: verified Podman socket, state OUTSIDE the repository.
#   scripts/tf.sh <data|app|phase00> <terraform args...>
# Data and app roots keep separate state files under $FRAY_STATE_DIR/terraform.
set -euo pipefail
root="${1:?usage: tf.sh <data|app|phase00> <args>}"
shift
case "$root" in data | app | phase00) ;; *)
  echo "unknown root $root" >&2
  exit 2
  ;;
esac
repo="$(cd "$(dirname "$0")/.." && pwd)"
dir="$repo/infra/terraform/$root"
TF="${TF:-terraform}"
TF_VAR_podman_docker_host="$(bash "$repo/scripts/podman_socket.sh")"
export TF_VAR_podman_docker_host TF_IN_AUTOMATION=1

if [[ "$root" == app ]]; then
  : "${FRAY_SECRETS_DIR:?}" "${PG_IMAGE:?}" "${VAULT_IMAGE:?}" "${OLLAMA_IMAGE:?}" "${WEB_IMAGE:?}"
  export TF_VAR_secrets_dir="$FRAY_SECRETS_DIR" TF_VAR_pg_image="$PG_IMAGE" TF_VAR_vault_image="$VAULT_IMAGE" \
    TF_VAR_ollama_image="$OLLAMA_IMAGE" TF_VAR_web_image="$WEB_IMAGE" TF_VAR_api_image="${API_IMAGE:-}" \
    TF_VAR_vault_agent_enabled="${VAULT_AGENT_ENABLED:-false}"
  [[ -n "${API_ENV_JSON:-}" ]] && export TF_VAR_api_env="$API_ENV_JSON"
fi

if [[ "$root" != phase00 ]]; then
  state_dir="${FRAY_STATE_DIR:?}/terraform"
  mkdir -p "$state_dir"
  chmod 700 "${FRAY_STATE_DIR}" "$state_dir"
  if [[ "${1:-}" == init || ! -d "$dir/.terraform" ]]; then
    "$TF" -chdir="$dir" init -input=false -reconfigure -backend-config="path=$state_dir/$root.tfstate" >/dev/null
    [[ "${1:-}" == init ]] && {
      echo "INIT_OK root=$root state=$state_dir/$root.tfstate"
      exit 0
    }
  fi
fi
exec "$TF" -chdir="$dir" "$@"
