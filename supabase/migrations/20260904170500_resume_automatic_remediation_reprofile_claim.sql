create or replace function governance.claim_profiling_remediation_verification(
  p_workflow_instance_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_id uuid;
begin
  update governance.profiling_remediation_outcomes
  set status = 'VERIFICATION_QUEUED',
      verification_requested_at = now(),
      verification_requested_by = p_user_id,
      updated_at = now()
  where workflow_instance_id = p_workflow_instance_id
    and verification_job_id is null
    and status in ('ACTION_TRACKED','VERIFICATION_QUEUED')
    and (
      status = 'ACTION_TRACKED'
      or verification_requested_at is null
      or verification_requested_at < now() - interval '15 minutes'
    )
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke all on function governance.claim_profiling_remediation_verification(uuid, uuid) from public;
revoke all on function governance.claim_profiling_remediation_verification(uuid, uuid) from authenticated;
grant execute on function governance.claim_profiling_remediation_verification(uuid, uuid) to service_role;
