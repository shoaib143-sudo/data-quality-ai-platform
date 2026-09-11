-- Tighten operator action scope and close the recovery loop after a governed retry.

revoke execute on function orchestration.request_execution_recovery_action(uuid, text) from authenticated, anon, public;

create or replace function orchestration.request_execution_recovery_action_admin(
  p_case_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from orchestration.recovery_cases
  where id = p_case_id;

  if not found then
    raise exception 'Recovery case not found.' using errcode = 'P0002';
  end if;

  if not app_private.is_project_admin(v_project_id) then
    raise exception 'Recovery actions require project administrator approval.' using errcode = '42501';
  end if;

  return orchestration.request_execution_recovery_action(p_case_id, p_action);
end;
$function$;

comment on function orchestration.request_execution_recovery_action_admin(uuid, text) is
  'Project-admin-only operator boundary for governed retry, acknowledgement, and rollback-review requests.';

revoke all on function orchestration.request_execution_recovery_action_admin(uuid, text) from public, anon;
grant execute on function orchestration.request_execution_recovery_action_admin(uuid, text) to authenticated;

create or replace function orchestration.resolve_execution_recovery_after_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case_id uuid;
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
       and action_type = 'RETRY'
       and status = 'QUEUED'
     order by requested_at desc
     limit 1
   );

  update orchestration.recovery_cases
     set status = 'RESOLVED',
         resolved_at = now(),
         updated_at = now()
   where id = v_case_id;

  return new;
end;
$function$;

drop trigger if exists trg_resolve_execution_recovery_after_success on orchestration.job_queue;
create trigger trg_resolve_execution_recovery_after_success
after update of status on orchestration.job_queue
for each row
when (new.status = 'SUCCEEDED')
execute function orchestration.resolve_execution_recovery_after_success();
