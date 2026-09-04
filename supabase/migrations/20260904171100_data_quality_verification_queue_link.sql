alter table governance.data_quality_remediation_outcomes
  add column if not exists verification_job_id uuid references orchestration.job_queue(id) on delete set null,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_generation integer not null default 0 check (verification_generation >= 0);

create index if not exists data_quality_remediation_verification_job_idx
  on governance.data_quality_remediation_outcomes(verification_job_id)
  where verification_job_id is not null;

select pg_notify('pgrst','reload schema');
