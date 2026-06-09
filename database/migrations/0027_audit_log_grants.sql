-- 0027_audit_log_grants.sql — SEC-7: audit_log append-only for the application role.
--
-- Background: 0002_core_schema.sql granted SELECT, INSERT, UPDATE, DELETE on all
-- public tables to app_user. Append-only audit integrity requires revoking mutation
-- privileges at the table level so a compromised app credential cannot tamper with
-- or erase audit rows.
--
-- UP (this file):
--   - app_user may INSERT new audit rows (writeAudit) and SELECT for the dashboard viewer.
--   - app_user may NOT UPDATE, DELETE, or TRUNCATE audit_log.
--
-- DOWN (manual rollback — run as migration owner / superuser):
--   GRANT UPDATE, DELETE, TRUNCATE ON TABLE audit_log TO app_user;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM app_user;

-- Reaffirm allowed privileges after REVOKE (idempotent).
GRANT SELECT, INSERT ON TABLE audit_log TO app_user;
