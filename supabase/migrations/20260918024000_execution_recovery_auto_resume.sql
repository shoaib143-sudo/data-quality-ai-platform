-- Resume the exact durable execution only after an autonomous repair has been independently validated.

create unique index if not exists recovery_actions_one_resume_per_attempt_idx
  on orchestration.recovery_actions(recovery_case_id, repair_attempt)
  where action_type = 'RESUME';

create or replace function orchestration.resume_execution_recovery_job(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_job orchestration.job_queue%rowtype;
  v_action_id uuid;
begin
  select * into v_case
  from orchestration.recovery_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;

  if v_case.severity not in ('P0', 'P1') then
    return jsonb_build_object('resumed', false, 'reason', 'SEVERITY_NOT_AUTOREPAIRABLE');
  end if;
  if v_case.authorization_decision is distinct from 'AUTHORIZED' then
    return jsonb_build_object('resumed', false, 'reason', 'REPAIR_NOT_AUTHORIZED');
  end if;
  if v_case.post_repair_validation_result is distinct from 'PASSED' then
    return jsonb_build_object('resumed', false, 'reason', 'REPAIR_NOT_VALIDATED');
  end if;
  if v_case.final_outcome <> 'OPEN' then
    return jsonb_build_object('resumed', false, 'reason', 'CASE_ALREADY_TERMINAL');
  end if;
  if v_case.retry_stage is null then
    return jsonb_build_object('resumed', false, 'reason', 'RETRY_STAGE_NOT_RECORDED');
  end if;

  select * into v_job
  from orchestration.job_queue
  where id = v_case.durable_job_id
  for update;

  if not found or v_job.status <> 'DEAD' then
    return jsonb_build_object('resumed', false, 'reason', 'DURABLE_JOB_NOT_DEAD');
  end if;

  begin
    insert into orchestration.recovery_actions (
      recovery_case_id, project_id, action_type, consent_source, status, repair_attempt, outcome
    ) values (
      v_case.id,
      v_case.project_id,
      'RESUME',
      'SYSTEM',
      'QUEUED',
      v_case.retry_attempt,
      jsonb_build_object(
        'retry_stage', v_case.retry_stage,
        'retry_checkpoint_id', v_case.retry_checkpoint_id,
        'durable_job_id', v_job.id,
        'attempts_before_resume', v_job.attempts,
        'queued_at', now()
      )
    ) returning id into v_action_id;
  exception when unique_violation then
    return jsonb_build_object('resumed', false, 'reason', 'RESUME_ALREADY_QUEUED');
  end;

  update orchestration.job_queue
     set status = 'QUEUED',
         max_attempts = greatest(max_attempts, attempts + 1),
         available_at = now(),
         lease_owner = null,
         lease_expires_at = null,
         completed_at = null,
         last_error = null,
         updated_at = now()
   where id = v_job.id;

  update orchestration.recovery_cases
     set status = 'RETRY_QUEUED',
         updated_at = now()
   where id = v_case.id;

  return jsonb_build_object(
    'resumed', true,
    'action_id', v_action_id,
    'durable_job_id', v_job.id,
    'retry_stage', v_case.retry_stage,
    'retry_checkpoint_id', v_case.retry_checkpoint_id
  );
end;
$function$;

revoke all on function orchestration.resume_execution_recovery_job(uuid)
  from public, anon, authenticated;

create or replace function orchestration.resolve_execution_recovery_after_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case_id uuid;
  v_action_id uuid;
begin
  if new.status <> 'SUCCEEDED' or old.status is not distinct from 'SUCCEEDED' then
    return new;
  end if;

  select id into v_case_id
  from orchestration.recovery_cases
  where durable_job_id = new.id
    and status = 'RETRY_QUEUED'
  for update;

  if not found then
    return new;
  end if;

  update orchestration.recovery_actions
     set status = 'EXECUTED',
         executed_at = now(),
         outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
           'durable_job_status', 'SUCCEEDED',
           'resolved_at', now()
         )
   where id = (
     select id
     from orchestration.recovery_actions
     where recovery_case_id = v_case_id
       and action_type in ('RETRY', 'RESUME')
       and status = 'QUEUED'
     order by requested_at desc
     limit 1
   )
  returning id into v_action_id;

  if v_action_id is null then
    raise exception 'Recovery case % cannot resolve without queued retry/resume evidence.', v_case_id using errcode = '23514';
  end if;

  update orchestration.recovery_cases
     set status = 'RESOLVED',
         final_outcome = 'RECOVERED',
         resolved_at = now(),
         updated_at = now()
   where id = v_case_id;

  return new;
end;
$function$;

create or replace function orchestration.enforce_recovery_retry_ceiling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case_id uuid;
  v_action_id uuid;
begin
  if new.status <> 'DEAD' or old.status is not distinct from 'DEAD' then
    return new;
  end if;

  select id into v_case_id
  from orchestration.recovery_cases
  where durable_job_id = new.id;

  if v_case_id is null then
    return new;
  end if;

  select id into v_action_id
  from orchestration.recovery_actions
  where recovery_case_id = v_case_id
    and action_type in ('RETRY', 'RESUME')
    and status = 'QUEUED'
  order by requested_at desc
  limit 1
  for update;

  if v_action_id is not null then
    update orchestration.recovery_actions
       set status = 'EXECUTED',
           executed_at = now(),
           outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
             'durable_job_status', 'DEAD',
             'governed_retry_succeeded', false,
             'failed_after_governed_retry', true,
             'terminal_at', now()
           )
     where id = v_action_id;

    update orchestration.recovery_cases
       set recommended_action = 'MANUAL_REVIEW',
           status = 'AWAITING_MANUAL_REVIEW',
           final_outcome = 'ESCALATED',
           escalation_reason = 'RESUMED_WORKFLOW_FAILED',
           updated_at = now()
     where id = v_case_id;
  end if;

  return new;
end;
$function$;

comment on function orchestration.resume_execution_recovery_job(uuid) is
  'Internal P0/P1 resume gate: only independently validated autonomous repairs may requeue the exact durable job.';
