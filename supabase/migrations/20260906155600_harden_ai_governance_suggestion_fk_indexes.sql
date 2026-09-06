create index if not exists ai_governance_suggestions_source_agent_run_fk_idx
  on governance.ai_governance_suggestions (source_agent_run_id);

create index if not exists ai_governance_suggestions_source_artifact_fk_idx
  on governance.ai_governance_suggestions (source_artifact_id);
