-- Cover composite foreign keys introduced by governed prospective evaluation.
-- These indexes support parent-key updates/deletes and satisfy Supabase FK advisor checks.

create index if not exists learning_evaluation_policies_candidate_fk_idx
  on agent.learning_evaluation_policies(candidate_id, project_id);

create index if not exists learning_evaluation_policies_manifest_fk_idx
  on agent.learning_evaluation_policies(dataset_manifest_id, project_id);

create index if not exists learning_evaluation_results_candidate_fk_idx
  on agent.learning_evaluation_results(candidate_id, project_id);

create index if not exists learning_evaluation_results_policy_fk_idx
  on agent.learning_evaluation_results(policy_id, project_id);
