-- Close direct execution of the PGCL trigger helper.
-- Trigger invocation does not require API-role EXECUTE privileges.
revoke all on function agent.validate_positive_learning_case_usage()
  from public, anon, authenticated, service_role;

comment on function agent.validate_positive_learning_case_usage() is
  'Internal PGCL integrity trigger helper. Direct execution is prohibited; invocation is trigger-only.';
