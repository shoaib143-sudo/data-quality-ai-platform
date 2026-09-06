create index if not exists autonomy_action_events_action_fk_idx
  on governance.autonomy_action_events (autonomy_action_id);

create index if not exists autonomy_action_events_policy_version_fk_idx
  on governance.autonomy_action_events (policy_version_id);

create index if not exists autonomy_actions_policy_version_fk_idx
  on governance.autonomy_actions (policy_version_id);
