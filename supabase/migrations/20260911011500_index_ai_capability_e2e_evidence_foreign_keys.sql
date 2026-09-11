-- Cover run-scoped capability evidence foreign keys reported by the Supabase performance advisor.
-- Keep the existing composite run/result/purpose index for run-scoped evidence queries and
-- add leading-key indexes for independent project and result foreign-key maintenance paths.

create index ai_capability_e2e_evidence_project_idx
  on governance.ai_capability_e2e_evidence(project_id);

create index ai_capability_e2e_evidence_result_idx
  on governance.ai_capability_e2e_evidence(result_id);
