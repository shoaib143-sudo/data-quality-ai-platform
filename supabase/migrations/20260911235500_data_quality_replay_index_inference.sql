-- PostgREST emits ON CONFLICT(column_list) without a predicate.
-- Replace the two partial indexes with full unique indexes so PostgreSQL can infer
-- them directly. Default NULL-distinct semantics preserve legacy rows that do not
-- belong to a native Data Quality run while governing every non-null DQ identity.

drop index if exists profiling.quality_rule_runs_replay_identity_uidx;
create unique index quality_rule_runs_replay_identity_uidx
  on profiling.quality_rule_runs (agent_run_id, rule_definition_id, profile_run_id);

drop index if exists profiling.quality_quarantine_records_replay_identity_uidx;
create unique index quality_quarantine_records_replay_identity_uidx
  on profiling.quality_quarantine_records (quality_rule_run_id, record_hash);
