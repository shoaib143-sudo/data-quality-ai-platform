alter table governance.data_quality_remediation_outcomes
  add column if not exists verification_profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  add column if not exists verification_profiling_agent_run_id uuid references agent.agent_runs(id) on delete set null,
  add column if not exists verification_profile_job_id uuid references orchestration.job_queue(id) on delete set null;

create index if not exists data_quality_remediation_profile_run_idx
  on governance.data_quality_remediation_outcomes(verification_profile_run_id)
  where verification_profile_run_id is not null;
create index if not exists data_quality_remediation_profile_job_idx
  on governance.data_quality_remediation_outcomes(verification_profile_job_id)
  where verification_profile_job_id is not null;

select pg_notify('pgrst','reload schema');
