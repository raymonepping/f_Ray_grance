-- Returns exactly 'CONFIGURED' when the base layout already matches.
SELECT CASE WHEN
  EXISTS (SELECT FROM pg_database WHERE datname = 'fray')
  AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('fray_owner','fray_runtime','fray_migrator','fray_backup','fray_vault_admin')) = 5
  AND (SELECT rolpassword IS NULL FROM pg_authid WHERE rolname = 'postgres')
THEN 'CONFIGURED' ELSE 'PENDING' END;
