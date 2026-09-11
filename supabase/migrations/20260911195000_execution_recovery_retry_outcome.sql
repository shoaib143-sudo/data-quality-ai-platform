-- Keep governed retry action state aligned with actual durable execution.
-- A queued retry is not executed until the durable job reaches a terminal outcome.

create or replace function orchestration.normalize_recovery_retry_action_execution()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.action_type = 'RETRY' and new.status = 'QUEUED' then
    new.executed_at := null;
  elsif new.action_type = 'RETRY' and new.status = 'EXECUTED' and new.executed_at is null then
    new.executed_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalize_recovery_retry_action_execution on orchestration.recovery_actions;
create trigger trg_normalize_recovery_retry_action_execution
before insert or update of status, executed_at on orchestration.recovery_actions
for each row
execute function orchestration.normalize_recovery_retry_action_execution();

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
    and action_type = 'RETRY'
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
           updated_at = now()
     where id = v_case_id;
  end if;

  return new;
end;
$function$;

comment on function orchestration.enforce_recovery_retry_ceiling() is
  'Records a failed governed retry as executed with DEAD outcome, then escalates the case to manual review without granting another retry.';
