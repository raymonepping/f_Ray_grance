-- Database-level, idempotent (runs inside database fray).
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS vector;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION fray_owner;
GRANT USAGE ON SCHEMA app TO fray_runtime, fray_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE fray_owner IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fray_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE fray_owner IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO fray_runtime;
ALTER ROLE fray_runtime SET search_path = app, public;
ALTER ROLE fray_migrator SET search_path = app, public;
