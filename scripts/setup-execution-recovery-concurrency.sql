do $do$
declare
  v_project_a uuid := '30000000-0000-4000-8000-000000000001';
  v_project_b uuid := '30000000-0000-4000-8000-000000000002';
begin
  insert into orchestration.job_queue(id, project_id, job_type, status, attempts, max_attempts, payload)
  values
    ('30000000-0000-4000-8000-000000000010', v_project_a, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    ('30000000-0000-4000-8000-000000000020', v_project_a, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    ('30000000-0000-4000-8000-000000000030', v_project_b, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb);

  insert into orchestration.recovery_cases(
    id, project_id, durable_job_id, job_type, classification, recommended_action,
    severity, authorization_decision, retry_attempt, final_outcome,
    post_repair_validation_result, failing_stage, original_workflow_run_id
  )
  values
    ('30000000-0000-4000-8000-000000000011', v_project_a, '30000000-0000-4000-8000-000000000010',
     'PROFILING', 'ORCHESTRATION', 'RETRY', 'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN',
     'GOVERNED_WORKFLOW', '30000000-0000-4000-8000-000000000101'),
    ('30000000-0000-4000-8000-000000000021', v_project_a, '30000000-0000-4000-8000-000000000020',
     'PROFILING', 'CONFIGURATION', 'RETRY', 'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN',
     'METRIC_EXECUTION', '30000000-0000-4000-8000-000000000102'),
    ('30000000-0000-4000-8000-000000000031', v_project_b, '30000000-0000-4000-8000-000000000030',
     'PROFILING', 'CONFIGURATION', 'RETRY', 'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN',
     'METRIC_EXECUTION', '30000000-0000-4000-8000-000000000103');
end
$do$;
