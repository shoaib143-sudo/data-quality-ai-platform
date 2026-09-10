alter table governance.data_quality_investigations
  drop constraint data_quality_investigations_status_check;

alter table governance.data_quality_investigations
  add constraint data_quality_investigations_status_check
  check (status = any (array[
    'CONTROLLED'::text,
    'NO_ACTIVE_CONTROLS'::text,
    'ATTENTION_REQUIRED'::text,
    'APPROVAL_REQUIRED'::text,
    'REMEDIATION_TRACKED'::text,
    'VERIFIED'::text,
    'VERIFICATION_FAILED'::text,
    'ERROR'::text
  ]));
