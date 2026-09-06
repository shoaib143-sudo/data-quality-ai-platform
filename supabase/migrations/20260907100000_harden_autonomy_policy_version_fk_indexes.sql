create index if not exists autonomy_policies_current_version_fk_idx
  on governance.autonomy_policies (current_version_id);

create index if not exists autonomy_policies_reviewed_by_fk_idx
  on governance.autonomy_policies (reviewed_by);

create index if not exists autonomy_policy_versions_project_fk_idx
  on governance.autonomy_policy_versions (project_id);
