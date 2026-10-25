-- Cluster-level, idempotent. Role model (least privilege):
--   fray_owner       NOLOGIN  owns schema app and all app objects
--   fray_migrator    NOLOGIN  group: Vault-issued migration logins (DDL via SET ROLE fray_owner)
--   fray_runtime     NOLOGIN  group: Vault-issued runtime logins (DML only)
--   fray_backup      LOGIN    pg_read_all_data; local socket only (no password)
--   fray_vault_admin LOGIN    CREATEROLE; password set + rotated by Vault (Phase 03)
\set ON_ERROR_STOP on
SELECT 'CREATE DATABASE fray' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fray')\gexec
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fray_owner') THEN CREATE ROLE fray_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fray_migrator') THEN CREATE ROLE fray_migrator NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fray_runtime') THEN CREATE ROLE fray_runtime NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fray_backup') THEN CREATE ROLE fray_backup LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fray_vault_admin') THEN CREATE ROLE fray_vault_admin LOGIN CREATEROLE; END IF;
END $$;
GRANT fray_owner TO fray_migrator;
GRANT pg_read_all_data TO fray_backup;
GRANT fray_runtime TO fray_vault_admin WITH ADMIN OPTION;
GRANT fray_migrator TO fray_vault_admin WITH ADMIN OPTION;
-- PG16+: lets Vault terminate sessions of roles it created during revocation (Phase 00 finding).
ALTER ROLE fray_vault_admin SET createrole_self_grant = 'set, inherit';
ALTER DATABASE fray OWNER TO fray_owner;
REVOKE ALL ON DATABASE fray FROM PUBLIC;
GRANT CONNECT ON DATABASE fray TO fray_runtime, fray_migrator, fray_backup, fray_vault_admin;
-- Superuser is reachable only through `podman exec` on the local socket.
ALTER ROLE postgres PASSWORD NULL;
