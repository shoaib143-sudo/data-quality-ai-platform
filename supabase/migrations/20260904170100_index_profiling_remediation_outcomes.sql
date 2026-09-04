create index if not exists profiling_remediation_outcomes_verification_run_idx
  on governance.profiling_remediation_outcomes(verification_profile_run_id)
  where verification_profile_run_id is not null;

create index if not exists profiling_remediation_outcomes_created_by_idx
  on governance.profiling_remediation_outcomes(created_by)
  where created_by is not null;
