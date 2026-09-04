alter table governance.profiling_remediation_outcomes
  drop constraint if exists profiling_remediation_outcomes_status_check;

alter table governance.profiling_remediation_outcomes
  add constraint profiling_remediation_outcomes_status_check
  check (status = any (array[
    'APPROVED'::text,
    'ACTION_TRACKED'::text,
    'VERIFICATION_QUEUED'::text,
    'VERIFICATION_CANCELLED'::text,
    'VERIFIED'::text,
    'VERIFICATION_FAILED'::text
  ]));

select pg_notify('pgrst','reload schema');
