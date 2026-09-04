alter table governance.profiling_remediation_outcomes
  add column if not exists verification_agent_run_id uuid references agent.agent_runs(id) on delete set null,
  add column if not exists verification_job_id uuid references orchestration.job_queue(id) on delete set null,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_requested_by uuid references auth.users(id) on delete set null;

alter table governance.profiling_remediation_outcomes
  drop constraint if exists profiling_remediation_outcomes_status_check;

alter table governance.profiling_remediation_outcomes
  add constraint profiling_remediation_outcomes_status_check
  check(status in ('APPROVED','ACTION_TRACKED','VERIFICATION_QUEUED','VERIFIED','VERIFICATION_FAILED'));

create index if not exists profiling_remediation_outcomes_verification_agent_run_idx
  on governance.profiling_remediation_outcomes(verification_agent_run_id)
  where verification_agent_run_id is not null;

create index if not exists profiling_remediation_outcomes_verification_job_idx
  on governance.profiling_remediation_outcomes(verification_job_id)
  where verification_job_id is not null;

create index if not exists profiling_remediation_outcomes_verification_requested_by_idx
  on governance.profiling_remediation_outcomes(verification_requested_by)
  where verification_requested_by is not null;

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
    and verification_profile_run_id is null
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
