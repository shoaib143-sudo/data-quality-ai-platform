-- Rollback-safe database acceptance for closed-loop Execution Recovery Agent evidence,
-- idempotent repair claims, P2 protection, stale-claim escalation, and validated resume.
begin;

do $acl$
begin
  if has_function_privilege('anon','orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.claim_execution_recovery_auto_repair(uuid,integer,text,text)','EXECUTE')
  then raise exception 'Autonomous repair claim RPC is exposed to an API role'; end if;

  if has_function_privilege('anon','orchestration.finalize_execution_recovery_auto_repair(uuid,integer,text,boolean,text,text)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.finalize_execution_recovery_auto_repair(uuid,integer,text,boolean,text,text)','EXECUTE')
  then raise exception 'Autonomous repair finalizer RPC is exposed to an API role'; end if;

  if has_function_privilege('anon','orchestration.resume_execution_recovery_job(uuid)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.resume_execution_recovery_job(uuid)','EXECUTE')
  then raise exception 'Autonomous recovery resume RPC is exposed to an API role'; end if;
end;
$acl$;

do $do$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_job_id uuid;
  v_case_id uuid;
  v_p2_job_id uuid;
  v_p2_case_id uuid;
  v_stale_job_id uuid;
  v_stale_case_id uuid;
  v_result jsonb;
  v_count integer;
begin
  insert into app.organizations(name,slug,metadata)
  values ('Execution recovery acceptance','exec-recovery-' || left(gen_random_uuid()::text,8),jsonb_build_object('synthetic',true))
  returning id into v_org_id;

  insert into app.projects(organization_id,name,slug,description,metadata)
  values (v_org_id,'Execution recovery acceptance','exec-recovery-' || left(gen_random_uuid()::text,8),'Disposable closed-loop recovery fixture',jsonb_build_object('synthetic',true))
  returning id into v_project_id;

  -- P1 happy path: terminal durable failure -> one repair claim -> validation -> exact durable resume -> resolution.
  insert into orchestration.job_queue(project_id,job_type,payload,status,attempts,max_attempts,lease_owner,lease_expires_at,last_error)
  values (v_project_id,'GOVERNANCE_AGENT',jsonb_build_object('synthetic',true),'RUNNING',3,3,'synthetic-worker',now()+interval '1 minute','connection timeout during governed workflow')
  returning id into v_job_id;

  update orchestration.job_queue
     set status='DEAD', completed_at=now(), updated_at=now()
   where id=v_job_id;

  select id into v_case_id
  from orchestration.recovery_cases
  where durable_job_id=v_job_id;

  if v_case_id is null then raise exception 'Terminal failure did not create a canonical recovery case'; end if;

  update orchestration.recovery_cases
     set severity='P1',
         authorization_decision='AUTHORIZED',
         proposed_repair='RETRY_SAFE_RUNTIME_REPAIR',
         consent_requirement='NONE',
         failing_stage='GOVERNED_WORKFLOW',
         failing_checkpoint_id='workflow-stage',
         retry_attempt=0,
         post_repair_validation_result='NOT_RUN',
         final_outcome='OPEN'
   where id=v_case_id;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_case_id,0,'reconcileDurableRuntimeLease','project:'||v_project_id||':durable-job:'||v_job_id);
  if coalesce((v_result->>'claimed')::boolean,false) is not true then
    raise exception 'Authorized P1 repair claim was not acquired: %',v_result;
  end if;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_case_id,0,'reconcileDurableRuntimeLease','project:'||v_project_id||':durable-job:'||v_job_id);
  if v_result->>'reason' <> 'ATTEMPT_ALREADY_CLAIMED' then
    raise exception 'Duplicate repair claim was not idempotently fenced: %',v_result;
  end if;

  -- Case flags alone are insufficient. Resume requires executed repair and validation evidence.
  update orchestration.recovery_cases
     set post_repair_validation_result='PASSED',retry_stage='GOVERNED_WORKFLOW',retry_checkpoint_id='workflow-stage'
   where id=v_case_id;
  v_result := orchestration.resume_execution_recovery_job(v_case_id);
  if v_result->>'reason' <> 'REPAIR_ACTION_EVIDENCE_MISSING' then
    raise exception 'Resume trusted case flags without executed repair evidence: %',v_result;
  end if;
  update orchestration.recovery_cases
     set post_repair_validation_result='NOT_RUN',retry_stage='GOVERNED_WORKFLOW',retry_checkpoint_id='workflow-stage'
   where id=v_case_id;

  v_result := orchestration.finalize_execution_recovery_auto_repair(
    v_case_id,0,'synthetic-mutation-1',true,'PASSED','DURABLE_RUNTIME_RECONCILED'
  );
  if v_result->>'validation_result' <> 'PASSED' then
    raise exception 'Repair validation evidence was not persisted: %',v_result;
  end if;

  if not exists(
    select 1 from orchestration.recovery_cases
    where id=v_case_id and post_repair_validation_result='PASSED'
      and retry_stage='GOVERNED_WORKFLOW' and retry_checkpoint_id='workflow-stage'
  ) then
    raise exception 'Repair finalizer did not checkpoint validated resume state atomically';
  end if;

  update orchestration.recovery_cases
     set root_cause_diagnosis='Synthetic retry-safe lease defect',
         repair_action_tool='reconcileDurableRuntimeLease',
         mutation_scope='project:'||v_project_id||':durable-job:'||v_job_id
   where id=v_case_id;

  v_result := orchestration.resume_execution_recovery_job(v_case_id);
  if coalesce((v_result->>'resumed')::boolean,false) is not true then
    raise exception 'Validated P1 recovery did not resume exact durable job: %',v_result;
  end if;

  if not exists(
    select 1 from orchestration.job_queue
    where id=v_job_id and status='QUEUED' and lease_owner is null and lease_expires_at is null and max_attempts>=attempts+1
  ) then
    raise exception 'Validated resume did not preserve and requeue the exact durable job';
  end if;

  if not exists(
    select 1 from orchestration.recovery_actions
    where recovery_case_id=v_case_id and action_type='AUTO_REPAIR' and repair_attempt=0 and status='EXECUTED'
      and outcome->>'mutation_id'='synthetic-mutation-1'
  ) then
    raise exception 'Automatic repair audit evidence is incomplete';
  end if;

  if not exists(
    select 1 from orchestration.recovery_actions
    where recovery_case_id=v_case_id and action_type='VALIDATE' and repair_attempt=0 and status='EXECUTED'
      and outcome->>'validation_result'='PASSED'
  ) then
    raise exception 'Independent validation audit evidence is incomplete';
  end if;

  if not exists(
    select 1 from orchestration.recovery_actions
    where recovery_case_id=v_case_id and action_type='RESUME' and repair_attempt=0 and status='QUEUED'
  ) then
    raise exception 'Resume audit evidence is incomplete';
  end if;

  update orchestration.job_queue set status='SUCCEEDED',completed_at=now(),updated_at=now() where id=v_job_id;

  if not exists(
    select 1 from orchestration.recovery_cases
    where id=v_case_id and status='RESOLVED' and final_outcome='RECOVERED' and resolved_at is not null
  ) then
    raise exception 'Successful resumed execution did not resolve its recovery case';
  end if;

  if not exists(
    select 1 from orchestration.recovery_actions
    where recovery_case_id=v_case_id and action_type='RESUME' and status='EXECUTED'
      and outcome->>'durable_job_status'='SUCCEEDED'
  ) then
    raise exception 'Successful resumed execution did not reconcile resume evidence';
  end if;

  -- P2 protection: deterministic database gate must reject autonomous mutation authority.
  insert into orchestration.job_queue(project_id,job_type,payload,status,attempts,max_attempts,last_error)
  values (v_project_id,'GOVERNANCE_AGENT',jsonb_build_object('synthetic',true),'RUNNING',3,3,'non-blocking lower priority issue')
  returning id into v_p2_job_id;
  update orchestration.job_queue set status='DEAD',completed_at=now(),updated_at=now() where id=v_p2_job_id;
  select id into v_p2_case_id from orchestration.recovery_cases where durable_job_id=v_p2_job_id;

  update orchestration.recovery_cases
     set severity='P2',authorization_decision='AUTHORIZED',retry_attempt=0,final_outcome='OPEN'
   where id=v_p2_case_id;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_p2_case_id,0,'should-not-run','project:'||v_project_id);
  if v_result->>'reason' <> 'SEVERITY_NOT_AUTOREPAIRABLE' then
    raise exception 'P2 autonomous repair was not blocked: %',v_result;
  end if;
  select count(*) into v_count from orchestration.recovery_actions where recovery_case_id=v_p2_case_id and action_type='AUTO_REPAIR';
  if v_count<>0 then raise exception 'P2 protection still persisted an automatic repair action'; end if;

  -- Stale uncertain mutation claim must escalate instead of replaying a possibly-applied side effect forever.
  insert into orchestration.job_queue(project_id,job_type,payload,status,attempts,max_attempts,last_error)
  values (v_project_id,'GOVERNANCE_AGENT',jsonb_build_object('synthetic',true),'RUNNING',3,3,'worker lease timeout')
  returning id into v_stale_job_id;
  update orchestration.job_queue set status='DEAD',completed_at=now(),updated_at=now() where id=v_stale_job_id;
  select id into v_stale_case_id from orchestration.recovery_cases where durable_job_id=v_stale_job_id;

  update orchestration.recovery_cases
     set severity='P1',authorization_decision='AUTHORIZED',consent_requirement='NONE',retry_attempt=0,final_outcome='OPEN'
   where id=v_stale_case_id;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_stale_case_id,0,'stale-repair','project:'||v_project_id);
  if coalesce((v_result->>'claimed')::boolean,false) is not true then raise exception 'Unable to create stale-claim fixture: %',v_result; end if;

  update orchestration.recovery_actions
     set requested_at=now()-interval '11 minutes'
   where recovery_case_id=v_stale_case_id and action_type='AUTO_REPAIR' and repair_attempt=0;

  v_result := orchestration.claim_execution_recovery_auto_repair(v_stale_case_id,0,'stale-repair','project:'||v_project_id);
  if v_result->>'reason' <> 'ATTEMPT_CLAIM_OUTCOME_UNCERTAIN' then
    raise exception 'Stale uncertain claim did not fail closed: %',v_result;
  end if;

  if not exists(
    select 1 from orchestration.recovery_cases
    where id=v_stale_case_id and status='AWAITING_MANUAL_REVIEW' and final_outcome='ESCALATED'
      and escalation_reason='REPAIR_CLAIM_OUTCOME_UNCERTAIN'
  ) then
    raise exception 'Stale uncertain claim did not persist governed escalation';
  end if;

  if not exists(
    select 1 from orchestration.recovery_actions
    where recovery_case_id=v_stale_case_id and action_type='AUTO_REPAIR' and status='REJECTED'
      and outcome->>'mutation_outcome'='UNKNOWN'
  ) then
    raise exception 'Stale uncertain claim did not preserve uncertainty evidence';
  end if;

  v_result := orchestration.finalize_execution_recovery_auto_repair(
    v_stale_case_id,0,'late-mutation',true,'PASSED','LATE_VALIDATION'
  );
  if coalesce((v_result->>'finalized')::boolean,false) is true
     or v_result->>'reason' <> 'RECOVERY_CASE_NO_LONGER_OPEN'
  then
    raise exception 'Late finalizer was allowed to overwrite stale-claim escalation: %',v_result;
  end if;

  if not exists(
    select 1 from orchestration.recovery_cases
    where id=v_stale_case_id and final_outcome='ESCALATED'
      and escalation_reason='REPAIR_CLAIM_OUTCOME_UNCERTAIN'
  ) then
    raise exception 'Late finalizer changed the governed stale-claim outcome';
  end if;
end;
$do$;

rollback;
