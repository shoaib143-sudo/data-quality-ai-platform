create index if not exists profile_anomalies_metric_definition_idx on profiling.profile_anomalies (metric_definition_id);
create index if not exists metric_repair_audit_profile_run_idx on profiling.metric_repair_audit (profile_run_id);
create index if not exists metric_repair_audit_metric_definition_idx on profiling.metric_repair_audit (metric_definition_id);
drop index if exists profiling.profile_anomalies_metric_idx;
