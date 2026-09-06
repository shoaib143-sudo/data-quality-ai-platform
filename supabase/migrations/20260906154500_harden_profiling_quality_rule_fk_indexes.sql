-- Cover active quality-rule lifecycle foreign keys that remain uncovered while
-- preserving the existing execution, versioning and authority semantics.

create index if not exists quality_rule_definitions_current_version_fk_idx
  on profiling.quality_rule_definitions (current_version_id);

create index if not exists quality_rule_runs_rule_version_fk_idx
  on profiling.quality_rule_runs (rule_version_id);

create index if not exists quality_rule_run_events_rule_definition_fk_idx
  on profiling.quality_rule_run_events (rule_definition_id);

create index if not exists quality_rule_run_events_rule_version_fk_idx
  on profiling.quality_rule_run_events (rule_version_id);
