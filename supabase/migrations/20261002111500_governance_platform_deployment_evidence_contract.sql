begin;

-- Forward-only repair for the governance platform evidence contract.
-- The runtime groups evidence by deployment_id; preserve migration history and
-- add/backfill the missing column rather than rewriting the original migration.
alter table governance.platform_execution_evidence
  add column if not exists deployment_id text;

update governance.platform_execution_evidence
set deployment_id = plan_id
where deployment_id is null or btrim(deployment_id) = '';

alter table governance.platform_execution_evidence
  alter column deployment_id set not null;

alter table governance.platform_execution_checkpoints
  add column if not exists claim_generation bigint not null default 0
  check (claim_generation >= 0);

create index if not exists platform_execution_evidence_deployment_idx
  on governance.platform_execution_evidence(project_id, deployment_id, recorded_at asc);

-- Evidence is append-only. Enforce that at the database layer as well as ACLs.
create or replace function governance.prevent_platform_execution_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'Governance platform execution evidence is append-only.';
end;
$function$;

drop trigger if exists platform_execution_evidence_immutable
  on governance.platform_execution_evidence;
create trigger platform_execution_evidence_immutable
before update or delete on governance.platform_execution_evidence
for each row execute function governance.prevent_platform_execution_evidence_mutation();

revoke all on function governance.prevent_platform_execution_evidence_mutation()
  from public, anon, authenticated;


-- Atomically claim a governance provider operation. Sequential get/upsert is
-- insufficient under concurrent workers because both can observe an empty row.
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

  select * into v_checkpoint
  from governance.platform_execution_checkpoints
  where project_id = p_project_id and idempotency_key = p_idempotency_key
  for update;

  if not found then
    insert into governance.platform_execution_checkpoints (
      project_id, plan_id, operation_id, idempotency_key, status, attempts, claim_generation, updated_at
    ) values (
      p_project_id, p_plan_id, p_operation_id, p_idempotency_key, 'RUNNING', 1, 1, v_now
    )
    returning * into v_checkpoint;
    return jsonb_build_object('claimed', true, 'resume_action', 'EXECUTE', 'checkpoint', to_jsonb(v_checkpoint));
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
  if v_checkpoint.status in ('PENDING','RUNNING') and v_checkpoint.provider_job_id is not null then
    return jsonb_build_object('claimed', false, 'resume_action', 'POLL', 'checkpoint', to_jsonb(v_checkpoint));
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

  return jsonb_build_object('claimed', true, 'resume_action', 'EXECUTE', 'checkpoint', to_jsonb(v_checkpoint));
end;
$function$;

create or replace function governance.put_platform_execution_checkpoint(
  p_project_id uuid,
  p_idempotency_key text,
  p_claim_generation bigint,
  p_status text,
  p_attempts integer,
  p_provider_object_id text,
  p_provider_job_id text,
  p_execution_evidence jsonb,
  p_verification_status text,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_checkpoint governance.platform_execution_checkpoints%rowtype;
begin
  if p_claim_generation <= 0 then
    raise exception 'Governance checkpoint write requires a positive claim generation.' using errcode = '22023';
  end if;
  if p_status not in ('PENDING','RUNNING','SUCCEEDED','FAILED','VERIFIED') then
    raise exception 'Governance checkpoint status is invalid.' using errcode = '22023';
  end if;

  update governance.platform_execution_checkpoints
  set status = p_status,
      attempts = p_attempts,
      provider_object_id = p_provider_object_id,
      provider_job_id = p_provider_job_id,
      execution_evidence = coalesce(p_execution_evidence, '{}'::jsonb),
      verification_status = p_verification_status,
      updated_at = coalesce(p_updated_at, now())
  where project_id = p_project_id
    and idempotency_key = p_idempotency_key
    and claim_generation = p_claim_generation
  returning * into v_checkpoint;

  if not found then
    raise exception 'GOVERNANCE_CHECKPOINT_FENCED: execution claim was superseded.';
  end if;
  return to_jsonb(v_checkpoint);
end;
$function$;

revoke all on function governance.claim_platform_execution_checkpoint(uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)
  from public, anon, authenticated;
grant execute on function governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)
  to service_role;
grant execute on function governance.claim_platform_execution_checkpoint(uuid,text,text,text)
  to service_role;

do $block$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'governance'
      and table_name = 'platform_execution_evidence'
      and column_name = 'deployment_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Governance platform deployment evidence contract was not installed.';
  end if;

  if not has_function_privilege('service_role', 'governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)', 'EXECUTE') then
    raise exception 'Governance platform checkpoint write privilege boundary is incorrect.';
  end if;

  if not has_function_privilege('service_role', 'governance.claim_platform_execution_checkpoint(uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'governance.claim_platform_execution_checkpoint(uuid,text,text,text)', 'EXECUTE') then
    raise exception 'Governance platform checkpoint claim privilege boundary is incorrect.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'governance.platform_execution_evidence'::regclass
      and tgname = 'platform_execution_evidence_immutable'
      and not tgisinternal
  ) then
    raise exception 'Governance platform evidence immutability trigger was not installed.';
  end if;
end;
$block$;

commit;
