begin;

-- Close the first-claim race without turning the losing claimant into an error.
-- INSERT ... ON CONFLICT serializes the initial creation on the unique
-- (project_id,idempotency_key) constraint. The winner receives EXECUTE.
-- The loser loads the committed checkpoint and follows the normal WAIT/POLL/
-- VERIFY/RECOVER/FAILED/COMPLETE state machine.
create or replace function governance.claim_platform_execution_checkpoint(
  p_project_id uuid,
  p_plan_id text,
  p_operation_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_checkpoint governance.platform_execution_checkpoints%rowtype;
  v_now timestamptz := now();
begin
  if p_project_id is null
     or nullif(btrim(p_plan_id), '') is null
     or nullif(btrim(p_operation_id), '') is null
     or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Governance checkpoint claim requires project, plan, operation, and idempotency key.'
      using errcode = '22023';
  end if;

  insert into governance.platform_execution_checkpoints (
    project_id, plan_id, operation_id, idempotency_key, status, attempts, claim_generation, updated_at
  ) values (
    p_project_id, p_plan_id, p_operation_id, p_idempotency_key, 'RUNNING', 1, 1, v_now
  )
  on conflict (project_id, idempotency_key) do nothing
  returning * into v_checkpoint;

  if found then
    return jsonb_build_object('claimed', true, 'resume_action', 'EXECUTE', 'checkpoint', to_jsonb(v_checkpoint));
  end if;

  select * into v_checkpoint
  from governance.platform_execution_checkpoints
  where project_id = p_project_id and idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'Governance checkpoint claim conflict resolved without a durable checkpoint.'
      using errcode = '40001';
  end if;

  if v_checkpoint.plan_id <> p_plan_id or v_checkpoint.operation_id <> p_operation_id then
    raise exception 'Governance idempotency key is already bound to a different plan operation.'
      using errcode = '23505';
  end if;

  if v_checkpoint.status = 'VERIFIED' then
    return jsonb_build_object('claimed', false, 'resume_action', 'COMPLETE', 'checkpoint', to_jsonb(v_checkpoint));
  end if;
  if v_checkpoint.status = 'SUCCEEDED' then
    return jsonb_build_object('claimed', false, 'resume_action', 'VERIFY', 'checkpoint', to_jsonb(v_checkpoint));
  end if;
  if v_checkpoint.status = 'FAILED' then
    return jsonb_build_object('claimed', false, 'resume_action', 'FAILED', 'checkpoint', to_jsonb(v_checkpoint));
  end if;
  if v_checkpoint.status in ('PENDING','RUNNING') and v_checkpoint.provider_job_id is not null then
    return jsonb_build_object('claimed', false, 'resume_action', 'POLL', 'checkpoint', to_jsonb(v_checkpoint));
  end if;
  if v_checkpoint.status = 'PENDING' then
    return jsonb_build_object('claimed', false, 'resume_action', 'WAIT', 'checkpoint', to_jsonb(v_checkpoint));
  end if;
  if v_checkpoint.status = 'RUNNING' and v_checkpoint.updated_at > v_now - interval '15 minutes' then
    return jsonb_build_object('claimed', false, 'resume_action', 'WAIT', 'checkpoint', to_jsonb(v_checkpoint));
  end if;

  update governance.platform_execution_checkpoints
  set status = 'RUNNING',
      attempts = attempts + 1,
      claim_generation = claim_generation + 1,
      updated_at = v_now
  where id = v_checkpoint.id
  returning * into v_checkpoint;

  return jsonb_build_object('claimed', true, 'resume_action', 'RECOVER', 'checkpoint', to_jsonb(v_checkpoint));
end;
$function$;

revoke all on function governance.claim_platform_execution_checkpoint(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function governance.claim_platform_execution_checkpoint(uuid,text,text,text)
  to service_role;

commit;
