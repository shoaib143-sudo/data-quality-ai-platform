-- Queue exact-stage or nearest-valid-checkpoint resume only after an autonomous repair
-- has been independently validated. Browser roles cannot invoke this internal primitive.

create unique index if not exists recovery_actions_one_resume_per_attempt_idx
  on orchestration.recovery_actions(recovery_case_id, repair_attempt)
  where action_type = 'RESUME';

create or replace function orchestration.queue_execution_recovery_resume(
  p_case_id uuid,
  p_repair_attempt integer,
  p_retry_stage text,
  p_retry_checkpoint_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case orchestration.recovery_cases%rowtype;
  v_job orchestration.job_queue%rowtype;
  v_action_id uuid;
  v_now timestamptz := now();
begin
  select * into v_case
  from orchestration.recovery_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;

  if v_case.severity not in ('P0', 'P1') then
    return jsonb_build_object('queued', false, 'reason', 'SEVERITY_NOT_AUTOREPAIRABLE');
  end if;

  if v_case.authorization_decision is distinct from 'AUTHORIZED' then
    return jsonb_build_object('queued', false, 'reason', 'REPAIR_NOT_AUTHORIZED');
  end if;

  if v_case.post_repair_validation_result is distinct from 'PASSED' then
    return jsonb_build_object('queued', false, 'reason', 'REPAIR_NOT_VALIDATED');
  end if;

  if v_case.final_outcome <> 'OPEN' then
    return jsonb_build_object('queued', false, 'reason', 'CASE_ALREADY_TERMINAL');
  end if;

  if v_case.retry_attempt <> p_repair_attempt then
    return jsonb_build_object('queued', false, 'reason', 'REPAIR_ATTEMPT_MISMATCH');
  end if;

  if nullif(trim(coalesce(p_retry_stage, '')), '') is null then
    return jsonb_build_object('queued', false, 'reason', 'RETRY_STAGE_REQUIRED');
  end if;

  if not exists (
    select 1
    from orchestration.recovery_actions
    where recovery_case_id = p_case_id
      and action_type = 'AUTO_REPAIR'
      and repair_attempt = p_repair_attempt
      and status = 'EXECUTED'
  ) then
    return jsonb_build_object('queued', false, 'reason', 'REPAIR_EVIDENCE_MISSING');
  end if;

  if not exists (
    select 1
    from orchestration.recovery_actions
    where recovery_case_id = p_case_id
      and action_type = 'VALIDATE'
      and repair_attempt = p_repair_attempt
      and status = 'EXECUTED'
      and outcome->>'validation_result' = 'PASSED'
  ) then
    return jsonb_build_object('queued', false, 'reason', 'VALIDATION_EVIDENCE_MISSING');
  end if;

  select * into v_job
  from orchestration.job_queue
  where id = v_case.durable_job_id
  for update;

  if not found then
    raise exception 'Durable recovery job not found.' using errcode = 'P0002';
  end if;

  if v_job.status = 'QUEUED' then
    select id into v_action_id
    from orchestration.recovery_actions
    where recovery_case_id = p_case_id
      and action_type = 'RESUME'
      and repair_attempt = p_repair_attempt
    limit 1;

    return jsonb_build_object(
      'queued', v_action_id is not null,
      'reason', case when v_action_id is not null then 'ALREADY_QUEUED' else 'JOB_QUEUED_WITHOUT_RESUME_EVIDENCE' end,
      'action_id', v_action_id,
      'durable_job_id', v_job.id
    );
  end if;

  if v_job.status <> 'DEAD' then
    return jsonb_build_object('queued', false, 'reason', 'JOB_NOT_RESUMABLE', 'job_status', v_job.status);
  end if;

  begin
    insert into orchestration.recovery_actions (
      recovery_case_id,
      project_id,
      action_type,
      consent_source,
      status,
      repair_attempt,
      outcome,
      requested_at
    ) values (
      v_case.id,
      v_case.project_id,
      'RESUME',
      'SYSTEM',
      'QUEUED',
      p_repair_attempt,
      jsonb_build_object(
        'retry_stage', p_retry_stage,
        'retry_checkpoint_id', nullif(trim(coalesce(p_retry_checkpoint_id, '')), ''),
        'durable_job_id', v_job.id,
        'attempts_before_resume', v_job.attempts,
        'queued_at', v_now
      ),
      v_now
    ) returning id into v_action_id;
  exception when unique_violation then
    select id into v_action_id
    from orchestration.recovery_actions
    where recovery_case_id = p_case_id
      and action_type = 'RESUME'
      and repair_attempt = p_repair_attempt
    limit 1;

    return jsonb_build_object(
      'queued', true,
      'reason', 'ALREADY_QUEUED',
      'action_id', v_action_id,
      'durable_job_id', v_job.id
    );
  end;

  update orchestration.job_queue
     set status = 'QUEUED',
         max_attempts = greatest(max_attempts, attempts + 1),
         available_at = v_now,
         lease_owner = null,
         lease_expires_at = null,
         completed_at = null,
         payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
           'recoveryResume',
           jsonb_build_object(
             'recovery_case_id', v_case.id,
             'repair_attempt', p_repair_attempt,
             'retry_stage', p_retry_stage,
             'retry_checkpoint_id', nullif(trim(coalesce(p_retry_checkpoint_id, '')), '')
           )
         ),
         updated_at = v_now
   where id = v_job.id;

  update orchestration.recovery_cases
     set status = 'RETRY_QUEUED',
         retry_stage = p_retry_stage,
         retry_checkpoint_id = nullif(trim(coalesce(p_retry_checkpoint_id, '')), ''),
         updated_at = v_now
   where id = v_case.id;

  return jsonb_build_object(
    'queued', true,
    'reason', 'QUEUED',
    'action_id', v_action_id,
    'durable_job_id', v_job.id,
    'retry_stage', p_retry_stage,
    'retry_checkpoint_id', nullif(trim(coalesce(p_retry_checkpoint_id, '')), '')
  );
end;
$function$;

revoke all on function orchestration.queue_execution_recovery_resume(uuid, integer, text, text)
  from public, anon, authenticated;

comment on function orchestration.queue_execution_recovery_resume(uuid, integer, text, text) is
  'Internal system resume after independently validated P0/P1 repair; requires durable repair and validation evidence and is idempotent per bounded attempt.';

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
    raise exception 'Recovery case % cannot resolve without queued retry or resume evidence.', v_case_id using errcode = '23514';
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
  v_action_type text;
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

  select id, action_type into v_action_id, v_action_type
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
           escalation_reason = case
             when v_action_type = 'RESUME' then 'RESUME_FAILED_AFTER_VALIDATED_REPAIR'
             else coalesce(escalation_reason, 'GOVERNED_RETRY_FAILED')
           end,
           updated_at = now()
     where id = v_case_id;
  end if;

  return new;
end;
$function$;

comment on function orchestration.enforce_recovery_retry_ceiling() is
  'Records failed governed RETRY or validated-repair RESUME execution, then escalates without granting an unbounded additional retry.';
