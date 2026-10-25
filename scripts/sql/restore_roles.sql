-- Role model for restore targets (mirrors ansible/roles/postgres_base/files/cluster.sql).
CREATE ROLE fray_owner NOLOGIN;
CREATE ROLE fray_migrator NOLOGIN;
CREATE ROLE fray_runtime NOLOGIN;
CREATE ROLE fray_backup LOGIN;
CREATE ROLE fray_vault_admin LOGIN CREATEROLE;
GRANT fray_owner TO fray_migrator;
GRANT pg_read_all_data TO fray_backup;
CREATE DATABASE fray OWNER fray_owner;
