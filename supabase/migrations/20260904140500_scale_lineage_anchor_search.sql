create index if not exists datasets_project_lower_name_prefix_idx
  on catalog.datasets(project_id, lower(name) text_pattern_ops);

create index if not exists profile_columns_run_lower_name_prefix_idx
  on profiling.profile_columns(profile_run_id, lower(column_name) text_pattern_ops);
