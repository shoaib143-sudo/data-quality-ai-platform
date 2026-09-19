-- Crash-recovery and execution-fencing acceptance for the current recovery contract.
do $do$
declare
  v_project uuid := '42000000-0000-4000-8000-000000000001';
  v_safe_job uuid := '42000000-0000-4000-8000-000000000010';
  v_safe_case uuid := '42000000-0000-4000-8000-000000000011';
  v_unsafe_job uuid := '42000000-0000-4000-8000-000000000020';
  v_unsafe_case uuid := '42000000-0000-4000-8000-000000000021';
  v_version_job uuid := '42000000-0000-4000-8000-000000000030';
  v_version_case uuid := '42000000-0000-4000-8000-000000000031';
  v_sibling_a uuid := '42000000-0000-4000-8000-000000000040';
  v_sibling_b uuid := '42000000-0000-4000-8000-000000000041';
  v_heavy_job uuid := '42000000-0000-4000-8000-000000000042';
  v_heavy_case uuid := '42000000-0000-4000-8000-000000000043';
  v_result jsonb;
  v_token_1 uuid;
  v_token_2 uuid;
  v_status text;
  v_outcome text;
  v_reason text;
  v_count integer;
begin
  insert into orchestration.job_queue(id, project_id, job_type, status, attempts, max_attempts, payload)
  values
    (v_safe_job, v_project, 'OBSERVABILITY', 'DEAD', 1, 1, '{}'::jsonb),
    (v_unsafe_job, v_project, 'PROFILING', 'DEAD', 1, 1, '{}'::jsonb),
    (v_version_job, v_project, 'OBSERVABILITY', 'DEAD', 1, 1, '{}'::jsonb),
    (v_sibling_a, v_project, 'DISCOVERY', 'SUCCEEDED', 1, 1, '{"workflow":"wf-heavy","ordinal":1}'::jsonb),
    (v_sibling_b, v_project, 'DISCOVERY', 'SUCCEEDED', 1, 1, '{"workflow":"wf-heavy","ordinal":2}'::jsonb),
    (v_heavy_job, v_project, 'DISCOVERY', 'DEAD', 1, 1, '{"workflow":"wf-heavy","ordinal":3}'::jsonb);

  insert into orchestration.recovery_cases(
    id, project_id, durable_job_id, job_type, classification, recommended_action,
    severity, authorization_decision, retry_attempt, final_outcome,
    post_repair_validation_result, failing_stage, original_workflow_run_id
  )
  values
    (v_safe_case, v_project, v_safe_job, 'OBSERVABILITY', 'ORCHESTRATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'GOVERNED_WORKFLOW', gen_random_uuid()),
    (v_unsafe_case, v_project, v_unsafe_job, 'PROFILING', 'CONFIGURATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'PROFILE_RUN', gen_random_uuid()),
    (v_version_case, v_project, v_version_job, 'OBSERVABILITY', 'ORCHESTRATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'GOVERNED_WORKFLOW', gen_random_uuid()),
    (v_heavy_case, v_project, v_heavy_job, 'DISCOVERY', 'ORCHESTRATION', 'RETRY',
     'P1', 'AUTHORIZED', 0, 'OPEN', 'NOT_RUN', 'SOURCE_READINESS', gen_random_uuid());

  -- Active execution cannot be claimed by a second worker.
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_safe_case, 0, 'lease_reconcile', 'project/job', 1, true, 300
  );
  if not coalesce((v_result->>'claimed')::boolean, false) then
    raise exception 'Initial safe fenced claim failed: %', v_result;
  end if;
  v_token_1 := (v_result->>'execution_token')::uuid;

  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_safe_case, 0, 'lease_reconcile', 'project/job', 1, true, 300
  );
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'ATTEMPT_IN_FLIGHT' then
    raise exception 'Active claim was not protected from a second worker: %', v_result;
  end if;

  -- Once the lease is stale, a replay-safe exact-version repair can be reclaimed.
  update orchestration.recovery_actions
     set execution_lease_expires_at = now() - interval '1 second'
   where recovery_case_id = v_safe_case and action_type = 'AUTO_REPAIR';

  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_safe_case, 0, 'lease_reconcile', 'project/job', 1, true, 300
  );
  if not coalesce((v_result->>'claimed')::boolean, false)
     or not coalesce((v_result->>'reclaimed')::boolean, false) then
    raise exception 'Replay-safe stale repair was not reclaimed: %', v_result;
  end if;
  v_token_2 := (v_result->>'execution_token')::uuid;
  if v_token_1 = v_token_2 then
    raise exception 'Reclaim did not rotate the execution fence token.';
  end if;

  begin
    perform orchestration.finalize_execution_recovery_auto_repair(
      v_safe_case, 0, v_token_1, 'stale-worker', true, 'PASSED', 'STALE'
    );
    raise exception 'Stale worker unexpectedly finalized a reclaimed action.';
  exception when sqlstate '55000' then
    null;
  end;

  v_result := orchestration.finalize_execution_recovery_auto_repair(
    v_safe_case, 0, v_token_2, 'current-worker', true, 'PASSED', 'LEASE_RECONCILED'
  );
  if v_result->>'validation_result' <> 'PASSED' then
    raise exception 'Current fenced worker did not finalize: %', v_result;
  end if;

  -- Unsafe stale work escalates instead of guessing whether mutation happened.
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_unsafe_case, 0, 'profiling_readiness', 'project/dataset', 1, false, 300
  );
  update orchestration.recovery_actions
     set execution_lease_expires_at = now() - interval '1 second'
   where recovery_case_id = v_unsafe_case and action_type = 'AUTO_REPAIR';
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_unsafe_case, 0, 'profiling_readiness', 'project/dataset', 1, false, 300
  );
  if coalesce((v_result->>'claimed')::boolean, true) or v_result->>'reason' <> 'STALE_ATTEMPT_REPLAY_UNSAFE' then
    raise exception 'Unsafe stale replay did not fail closed: %', v_result;
  end if;
  select status, final_outcome, escalation_reason into v_status, v_outcome, v_reason
  from orchestration.recovery_cases where id = v_unsafe_case;
  if v_status <> 'AWAITING_MANUAL_REVIEW' or v_outcome <> 'ESCALATED'
     or v_reason <> 'STALE_ATTEMPT_REPLAY_UNSAFE' then
    raise exception 'Unsafe stale replay escalation evidence is incomplete: %, %, %', v_status, v_outcome, v_reason;
  end if;

  -- Contract drift on stale work fails closed even if both callers claim replay safety.
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_version_case, 0, 'lease_reconcile', 'project/versioned-job', 1, true, 300
  );
  update orchestration.recovery_actions
     set execution_lease_expires_at = now() - interval '1 second'
   where recovery_case_id = v_version_case and action_type = 'AUTO_REPAIR';
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_version_case, 0, 'lease_reconcile', 'project/versioned-job', 2, true, 300
  );
  if coalesce((v_result->>'claimed')::boolean, true)
     or v_result->>'reason' <> 'REPLAY_CONTRACT_VERSION_MISMATCH' then
    raise exception 'Replay contract mismatch did not fail closed: %', v_result;
  end if;

  -- Heavy-job restart only requeues the failed durable job and clears its internal checkpoint.
  v_result := orchestration.claim_execution_recovery_auto_repair(
    v_heavy_case, 0, 'lease_reconcile', 'project/heavy-job', 1, true, 300
  );
  v_token_1 := (v_result->>'execution_token')::uuid;
  perform orchestration.finalize_execution_recovery_auto_repair(
    v_heavy_case, 0, v_token_1, 'heavy-repair', true, 'PASSED', 'SOURCE_READY'
  );
  update orchestration.recovery_cases
     set post_repair_validation_result = 'PASSED',
         retry_stage = 'SOURCE_READINESS',
         retry_checkpoint_id = 'internal-discovery-checkpoint'
   where id = v_heavy_case;

  v_result := orchestration.queue_execution_recovery_resume(
    v_heavy_case, 0, 'SOURCE_READINESS', 'internal-discovery-checkpoint'
  );
  if not coalesce((v_result->>'queued')::boolean, false)
     or v_result->>'restart_scope' <> 'WHOLE_JOB'
     or v_result->>'retry_checkpoint_id' is not null then
    raise exception 'Discovery did not restart the failed durable job from its beginning: %', v_result;
  end if;

  select count(*) into v_count from orchestration.job_queue
  where id in (v_sibling_a, v_sibling_b) and status = 'SUCCEEDED';
  if v_count <> 2 then
    raise exception 'Completed sibling/upstream durable jobs were modified during recovery.';
  end if;
  select status into v_status from orchestration.job_queue where id = v_heavy_job;
  if v_status <> 'QUEUED' then
    raise exception 'Failed heavy durable job was not requeued: %', v_status;
  end if;

  -- Legacy unfenced mutation APIs must fail closed.
  v_result := orchestration.claim_execution_recovery_auto_repair(v_safe_case, 0, 'legacy', 'legacy');
  if v_result->>'reason' <> 'REPLAY_METADATA_REQUIRED' then
    raise exception 'Legacy claim did not require replay metadata: %', v_result;
  end if;
  v_result := orchestration.finalize_execution_recovery_auto_repair(
    v_safe_case, 0, 'legacy', true, 'PASSED', 'LEGACY'
  );
  if v_result->>'reason' <> 'EXECUTION_FENCE_TOKEN_REQUIRED' then
    raise exception 'Legacy finalizer did not require execution fence token: %', v_result;
  end if;

  if has_function_privilege('authenticated', 'orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text,integer,boolean,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'orchestration.finalize_execution_recovery_auto_repair(uuid,integer,uuid,text,boolean,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'orchestration.queue_execution_recovery_resume(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'Browser-authenticated role gained internal execution recovery authority.';
  end if;
  if not has_function_privilege('service_role', 'orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text,integer,boolean,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'orchestration.finalize_execution_recovery_auto_repair(uuid,integer,uuid,text,boolean,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'orchestration.queue_execution_recovery_resume(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'Server service role is missing fenced execution recovery authority.';
  end if;
  if has_function_privilege('service_role', 'orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'orchestration.finalize_execution_recovery_auto_repair(uuid,integer,text,boolean,text,text)', 'EXECUTE') then
    raise exception 'Service role can execute a legacy unfenced recovery overload.';
  end if;
end
$do$;

select 'Native compensation crash recovery acceptance passed.' as result;
