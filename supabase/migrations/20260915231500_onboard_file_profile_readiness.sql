-- FILE_V1 and CSV_V1 are onboarded in the canonical project profile readiness V2 function.
-- This forward migration intentionally does not replace that function, preserving JDBC_V1 semantics.
select pg_notify('pgrst','reload schema');
