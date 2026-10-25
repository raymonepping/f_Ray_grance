#!/usr/bin/env bash
# Operator-local bootstrap. Creates protected directories and the PostgreSQL
# bootstrap superuser password FILE. The value is never printed, logged,
# committed or passed to Terraform (only its path is). After first init the
# superuser loses its network password (Ansible); local socket only.
set -euo pipefail
umask 077
for d in "$FRAY_CONFIG_DIR" "$FRAY_SECRETS_DIR" "$FRAY_STATE_DIR" "$FRAY_BACKUP_DIR"; do
  mkdir -p "$d"
  chmod 700 "$d"
done
f="$FRAY_SECRETS_DIR/pg_superuser"
if [[ ! -s "$f" ]]; then
  openssl rand -base64 33 | tr -d '\n/+=' >"$f"
  echo "created $f"
else
  echo "kept existing $f"
fi
# Must be readable by the container's postgres user through the VM file share;
# the parent directory (0700) is what protects it on the Mac.
chmod 644 "$f"
echo "BOOTSTRAP_OK config=$FRAY_CONFIG_DIR backups=$FRAY_BACKUP_DIR"
