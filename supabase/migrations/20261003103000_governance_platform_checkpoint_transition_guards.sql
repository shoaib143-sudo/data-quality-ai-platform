begin;

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

  select * into v_checkpoint
  from governance.platform_execution_checkpoints
  where project_id = p_project_id
    and idempotency_key = p_idempotency_key
    and claim_generation = p_claim_generation
  for update;

  if not found then
    raise exception 'GOVERNANCE_CHECKPOINT_FENCED: execution claim was superseded.';
  end if;

  if p_attempts < v_checkpoint.attempts then
    raise exception 'GOVERNANCE_CHECKPOINT_INVALID_TRANSITION: attempts cannot decrease.' using errcode = '22023';
  end if;

  if not (
    (v_checkpoint.status = 'RUNNING' and p_status in ('RUNNING','PENDING','SUCCEEDED','FAILED','VERIFIED'))
    or (v_checkpoint.status = 'PENDING' and p_status in ('PENDING','SUCCEEDED','FAILED'))
    or (v_checkpoint.status = 'SUCCEEDED' and p_status in ('SUCCEEDED','VERIFIED'))
    or (v_checkpoint.status = 'FAILED' and p_status = 'FAILED')
    or (v_checkpoint.status = 'VERIFIED' and p_status = 'VERIFIED')
  ) then
    raise exception 'GOVERNANCE_CHECKPOINT_INVALID_TRANSITION: % cannot transition to %.', v_checkpoint.status, p_status
      using errcode = '22023';
  end if;

  update governance.platform_execution_checkpoints
  set status = p_status,
      attempts = p_attempts,
      provider_object_id = coalesce(p_provider_object_id, v_checkpoint.provider_object_id),
      provider_job_id = coalesce(p_provider_job_id, v_checkpoint.provider_job_id),
      execution_evidence = coalesce(p_execution_evidence, v_checkpoint.execution_evidence, '{}'::jsonb),
      verification_status = coalesce(p_verification_status, v_checkpoint.verification_status),
      updated_at = coalesce(p_updated_at, now())
  where id = v_checkpoint.id
  returning * into v_checkpoint;

  return to_jsonb(v_checkpoint);
end;
$function$;

revoke all on function governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)
  from public, anon, authenticated;
grant execute on function governance.put_platform_execution_checkpoint(uuid,text,bigint,text,integer,text,text,jsonb,text,timestamptz)
  to service_role;

commit;
