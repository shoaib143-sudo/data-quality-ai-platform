
revoke execute on function governance.audit_project_table_change() from public, anon, authenticated;
revoke execute on function governance.record_lineage_for_dataset() from public, anon, authenticated;
revoke execute on function governance.record_lineage_for_dataset_version() from public, anon, authenticated;
revoke execute on function governance.record_lineage_for_profile_run() from public, anon, authenticated;
grant execute on function governance.audit_project_table_change() to service_role;
grant execute on function governance.record_lineage_for_dataset() to service_role;
grant execute on function governance.record_lineage_for_dataset_version() to service_role;
grant execute on function governance.record_lineage_for_profile_run() to service_role;
