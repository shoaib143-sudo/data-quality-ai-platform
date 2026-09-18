drop trigger if exists trg_test_resolve_execution_recovery_after_success on orchestration.job_queue;
create trigger trg_test_resolve_execution_recovery_after_success
after update of status on orchestration.job_queue
for each row
when (new.status = 'SUCCEEDED')
execute function orchestration.resolve_execution_recovery_after_success();

drop trigger if exists trg_test_enforce_recovery_retry_ceiling on orchestration.job_queue;
create trigger trg_test_enforce_recovery_retry_ceiling
after update of status on orchestration.job_queue
for each row
when (new.status = 'DEAD')
execute function orchestration.enforce_recovery_retry_ceiling();

do $do$
declare
  v_project uuid := '20000000-0000-4000-8000-000000000001';
  v_job_p2 uuid := '20000000-0000-4000-8000-000000000010';
  v_case_p2 uuid := '20000000-0000-4000-8000-000000000011';
  v_job_success uuid := '20000000-0000-4000-8000-000000000020';
  v_case_success uuid := '20000000-0000-4000-8000-000000000021';
  v_job_no_validation uuid := '20000000-0000-4000-8000-000000000030';
  v_case_no_validation uuid := '20000000-0000-4000-8000-000000000031';
  v_job_no_repair uuid := '20000000-0000-4000-8000-000000000040';
  v_case_no_repair uuid := '20000000-0000-4000-8000-000000000041';
  v_job_failed_resume uuid := '20000000-0000-4000-8000-000000000050';
  v_case_failed_resume uuid := '20000000-0000-4000-8000-000000000051';
  v_job_unauthorized uuid := '20000000-0000-4000-8000-000000000060';
  v_case_unauthorized uuid := '20000000-0000-4000-8000-000000000061';
  v_job_failed_job uuid := '20000000-0000-4000-8000-000000000070';
  v_case_failed_job uuid := '20000000-0000-4000-8000-000000000071';
  v_result jsonb;
  v_count integer;
  v_payload jsonb;
  v_status text;
  v_outcome text;
  v_reason text;
  v_checkpoint text;
begin
  insert into orchestration.job_queue(id, project_id, job_type, status, attempts, max_attempts, payload)
  values
    (v_job_p2, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_success, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_no_validation, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_no_repair, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_failed_resume, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_unauthorized, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_job_failed_job, v_project, 'OBSERVABILITY', 'DEAD', 1, 1, '{}'::jsonb);

  insert into orchestration.recovery_cases(
    id, project_id, durable_job_id, job_type, classification, recommended_action,
    severity, authorization_decision, retry_attempt, final_outcome,
    post_repair_validation_result, failing_stage, original_workflow_run_id
  )
  values
    (v_case_p2, v_project, v_job_p2, 'PROFILING', 'UNKNOWN', 'MANUAL_REVIEW',
     'P2', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_success, v_project, v_job_success, 'PROFILING', 'CONFIGURATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_no_validation, v_project, v_job_no_validation, 'PROFILING', 'CONFIGURATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_no_repair, v_project, v_job_no_repair, 'PROFILING', 'CONFIGURATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'PASSED', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_failed_resume, v_project, v_job_failed_resume, 'PROFILING', 'CONFIGURATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_unauthorized, v_project, v_job_unauthorized, 'PROFILING', 'AUTHORIZATION', 'MANUAL_REVIEW',
     'P1', 'ESCALATE', 0, 'OPEN', 'NOT_RUN', 'METRIC_EXECUTION', gen_random_uuid()),
    (v_case_failed_job, v_project, v_job_failed_job, 'OBSERVABILITY', 'ORCHESTRATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'GOVERNED_WORKFLOW', gen_random_uuid());

  v_result := orchestration.claim_execution_recovery_auto_repair(v_case_p2, 0, 'test', 'scope');
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'SEVERITY_NOT_AUTOREPAIRABLE' then
    raise exception 'P2 autonomous repair was not blocked: %', v_result;
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_case_unauthorized, 0, 'test', 'scope');
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'REPAIR_NOT_AUTHORIZED' then
    raise exception 'Unauthorized P1 repair was not blocked: %', v_result;
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_case_success, 1, 'test', 'scope');
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'REPAIR_ATTEMPT_MISMATCH' then
    raise exception 'Repair attempt mismatch was not blocked: %', v_result;
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_case_success, 0, 'source_readiness_repair', 'project/source'
  );
  if not coalesce((v_result->>'claimed')::boolean, false) then
    raise exception 'Authorized P1 repair was not claimed: %', v_result;
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_case_success, 0, 'source_readiness_repair', 'project/source'
  );
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'ATTEMPT_ALREADY_CLAIMED' then
    raise exception 'Duplicate repair claim was not rejected: %', v_result;
  end if;

  v_result := orchestration.finalize_execution_recovery_auto_repair(
    v_case_success, 0, 'mutation-success', true, 'PASSED', 'SOURCE_READINESS_RESTORED'
  );
  if v_result->>'validation_result' <> 'PASSED' then
    raise exception 'Successful repair validation evidence was not persisted: %', v_result;
  end if;

  update orchestration.recovery_cases
     set post_repair_validation_result = 'PASSED',
         retry_stage = 'METRIC_EXECUTION',
         retry_checkpoint_id = 'metric-step',
         final_outcome = 'OPEN'
   where id = v_case_success;

  v_result := orchestration.queue_execution_recovery_resume(
    v_case_success, 0, 'METRIC_EXECUTION', 'metric-step'
  );
  if not coalesce((v_result->>'queued')::boolean, false)
     or v_result->>'reason' <> 'QUEUED'
     or v_result->>'restart_scope' <> 'WHOLE_JOB'
     or v_result->>'retry_checkpoint_id' is not null then
    raise exception 'Validated heavy-job repair did not queue a whole-job restart: %', v_result;
  end if;

  select payload, status into v_payload, v_status from orchestration.job_queue where id = v_job_success;
  if v_status <> 'QUEUED'
     or v_payload#>>'{recoveryResume,retry_stage}' <> 'METRIC_EXECUTION'
     or v_payload#>>'{recoveryResume,restart_scope}' <> 'WHOLE_JOB'
     or v_payload#>>'{recoveryResume,retry_checkpoint_id}' is not null then
    raise exception 'Whole-job restart boundary was not persisted on durable job: status %, payload %', v_status, v_payload;
  end if;

  select retry_checkpoint_id into v_checkpoint
  from orchestration.recovery_cases where id = v_case_success;
  if v_checkpoint is not null then
    raise exception 'Whole-job restart retained stale recovery checkpoint: %', v_checkpoint;
  end if;

  select count(*) into v_count
  from orchestration.recovery_actions
  where recovery_case_id = v_case_success and action_type = 'RESUME';
  if v_count <> 1 then raise exception 'Expected one RESUME action, found %', v_count; end if;

  v_result := orchestration.queue_execution_recovery_resume(
    v_case_success, 0, 'METRIC_EXECUTION', 'metric-step'
  );
  if not coalesce((v_result->>'queued')::boolean, false)
     or v_result->>'reason' <> 'ALREADY_QUEUED'
     or v_result->>'restart_scope' <> 'WHOLE_JOB'
     or v_result->>'retry_checkpoint_id' is not null then
    raise exception 'Whole-job restart replay was not idempotent: %', v_result;
  end if;

  select count(*) into v_count
  from orchestration.recovery_actions
  where recovery_case_id = v_case_success and action_type = 'RESUME';
  if v_count <> 1 then raise exception 'Resume replay duplicated side effects: %', v_count; end if;

  perform orchestration.claim_execution_recovery_auto_repair(
    v_case_failed_job, 0, 'observability_repair', 'project/observability'
  );
  perform orchestration.finalize_execution_recovery_auto_repair(
    v_case_failed_job, 0, 'mutation-observability', true, 'PASSED', 'OBSERVABILITY_RESTORED'
  );
  update orchestration.recovery_cases
     set post_repair_validation_result = 'PASSED',
         retry_stage = 'GOVERNED_WORKFLOW',
         retry_checkpoint_id = 'observability-step'
   where id = v_case_failed_job;
  v_result := orchestration.queue_execution_recovery_resume(
    v_case_failed_job, 0, 'GOVERNED_WORKFLOW', 'observability-step'
  );
  if not coalesce((v_result->>'queued')::boolean, false)
     or v_result->>'restart_scope' <> 'FAILED_JOB'
     or v_result->>'retry_checkpoint_id' <> 'observability-step' then
    raise exception 'Non-heavy job did not preserve failed-job checkpoint semantics: %', v_result;
  end if;
  select payload, status into v_payload, v_status
  from orchestration.job_queue where id = v_job_failed_job;
  if v_status <> 'QUEUED'
     or v_payload#>>'{recoveryResume,restart_scope}' <> 'FAILED_JOB'
     or v_payload#>>'{recoveryResume,retry_checkpoint_id}' <> 'observability-step' then
    raise exception 'Non-heavy failed-job restart boundary was not persisted: status %, payload %', v_status, v_payload;
  end if;
  select retry_checkpoint_id into v_checkpoint
  from orchestration.recovery_cases where id = v_case_failed_job;
  if v_checkpoint <> 'observability-step' then
    raise exception 'Non-heavy failed-job recovery lost its checkpoint: %', v_checkpoint;
  end if;

  update orchestration.job_queue set status = 'SUCCEEDED', completed_at = now() where id = v_job_success;
  select status, final_outcome into v_status, v_outcome
  from orchestration.recovery_cases where id = v_case_success;
  if v_status <> 'RESOLVED' or v_outcome <> 'RECOVERED' then
    raise exception 'Successful resumed workflow did not resolve recovery: %, %', v_status, v_outcome;
  end if;

  select count(*) into v_count
  from orchestration.recovery_actions
  where recovery_case_id = v_case_success and action_type = 'RESUME' and status = 'EXECUTED';
  if v_count <> 1 then raise exception 'Successful resume action was not reconciled: %', v_count; end if;

  select count(*) into v_count
  from orchestration.recovery_actions
  where recovery_case_id = v_case_success
    and action_type in ('AUTO_REPAIR','VALIDATE','RESUME')
    and status = 'EXECUTED';
  if v_count <> 3 then
    raise exception 'Audit chain is incomplete; expected repair, validation, and resume evidence, found %', v_count;
  end if;

  if not exists (
    select 1
    from orchestration.recovery_actions
    where recovery_case_id = v_case_success
      and action_type = 'AUTO_REPAIR'
      and outcome ? 'action_key'
      and outcome ? 'mutation_id'
      and outcome->>'repair_applied' = 'true'
  ) then
    raise exception 'AUTO_REPAIR evidence is incomplete.';
  end if;

  if not exists (
    select 1
    from orchestration.recovery_actions
    where recovery_case_id = v_case_success
      and action_type = 'VALIDATE'
      and outcome->>'validation_result' = 'PASSED'
      and outcome ? 'validation_code'
  ) then
    raise exception 'VALIDATE evidence is incomplete.';
  end if;

  if not exists (
    select 1
    from orchestration.recovery_actions
    where recovery_case_id = v_case_success
      and action_type = 'RESUME'
      and outcome->>'retry_stage' = 'METRIC_EXECUTION'
      and outcome->>'restart_scope' = 'WHOLE_JOB'
      and outcome->>'retry_checkpoint_id' is null
  ) then
    raise exception 'Whole-job restart evidence is incomplete.';
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_case_no_validation, 0, 'repair', 'scope'
  );
  perform orchestration.finalize_execution_recovery_auto_repair(
    v_case_no_validation, 0, 'mutation-no-validation', true, 'NOT_RUN', ''
  );
  update orchestration.recovery_cases
     set post_repair_validation_result = 'PASSED'
   where id = v_case_no_validation;
  v_result := orchestration.queue_execution_recovery_resume(
    v_case_no_validation, 0, 'METRIC_EXECUTION', 'metric-step'
  );
  if v_result->>'reason' <> 'VALIDATION_EVIDENCE_MISSING' then
    raise exception 'Missing validation audit evidence did not block resume: %', v_result;
  end if;

  v_result := orchestration.queue_execution_recovery_resume(
    v_case_no_repair, 0, 'METRIC_EXECUTION', 'metric-step'
  );
  if v_result->>'reason' <> 'REPAIR_EVIDENCE_MISSING' then
    raise exception 'Missing repair audit evidence did not block resume: %', v_result;
  end if;

  perform orchestration.claim_execution_recovery_auto_repair(
    v_case_failed_resume, 0, 'repair', 'scope'
  );
  perform orchestration.finalize_execution_recovery_auto_repair(
    v_case_failed_resume, 0, 'mutation-failed-resume', true, 'PASSED', 'ROOT_CAUSE_CLEARED'
  );
  update orchestration.recovery_cases
     set post_repair_validation_result = 'PASSED',
         retry_stage = 'METRIC_EXECUTION',
         retry_checkpoint_id = 'metric-step'
   where id = v_case_failed_resume;
  v_result := orchestration.queue_execution_recovery_resume(
    v_case_failed_resume, 0, 'METRIC_EXECUTION', 'metric-step'
  );
  if not coalesce((v_result->>'queued')::boolean, false) then
    raise exception 'Failed-resume fixture was not queued: %', v_result;
  end if;

  update orchestration.job_queue
     set status = 'DEAD', last_error = 'same stage retry failed'
   where id = v_job_failed_resume;

  select status, final_outcome, escalation_reason
    into v_status, v_outcome, v_reason
  from orchestration.recovery_cases
  where id = v_case_failed_resume;
  if v_status <> 'AWAITING_MANUAL_REVIEW'
     or v_outcome <> 'ESCALATED'
     or v_reason <> 'RESUME_FAILED_AFTER_VALIDATED_REPAIR' then
    raise exception 'Failed resume did not stop at bounded escalation: %, %, %', v_status, v_outcome, v_reason;
  end if;

  if has_function_privilege('authenticated', 'orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'Authenticated role must not execute autonomous repair claim RPC.';
  end if;
  if has_function_privilege('authenticated', 'orchestration.finalize_execution_recovery_auto_repair(uuid,integer,text,boolean,text,text)', 'EXECUTE') then
    raise exception 'Authenticated role must not execute autonomous repair finalizer RPC.';
  end if;
  if has_function_privilege('authenticated', 'orchestration.queue_execution_recovery_resume(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'Authenticated role must not execute autonomous recovery resume RPC.';
  end if;
end
$do$;

select 'Execution recovery persistence acceptance passed.' as result;
