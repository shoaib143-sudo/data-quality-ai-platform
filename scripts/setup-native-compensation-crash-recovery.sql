-- Seed one disposable case for a true parallel fenced-claim race.
do $do$
declare
  v_project uuid := '41000000-0000-4000-8000-000000000001';
  v_job uuid := '41000000-0000-4000-8000-000000000010';
  v_case uuid := '41000000-0000-4000-8000-000000000011';
begin
  insert into orchestration.job_queue(id, project_id, job_type, status, attempts, max_attempts, payload)
  values (v_job, v_project, 'OBSERVABILITY', 'DEAD', 1, 1, '{}'::jsonb)
  on conflict (id) do nothing;

  insert into orchestration.recovery_cases(
    id, project_id, durable_job_id, job_type, classification, recommended_action,
    severity, authorization_decision, retry_attempt, final_outcome,
    post_repair_validation_result, failing_stage, original_workflow_run_id
  )
  values (
    v_case, v_project, v_job, 'OBSERVABILITY', 'ORCHESTRATION', 'RETRY',
    'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'GOVERNED_WORKFLOW', gen_random_uuid()
  )
  on conflict (id) do nothing;
end
$do$;
