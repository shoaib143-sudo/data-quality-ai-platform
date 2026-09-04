alter table orchestration.job_queue drop constraint if exists job_queue_job_type_check;
alter table orchestration.job_queue add constraint job_queue_job_type_check
check (job_type = any (array[
  'PROFILING'::text,
  'DATA_QUALITY'::text,
  'NOTIFICATION'::text,
  'OBSERVABILITY'::text,
  'DISCOVERY'::text,
  'SEMANTIC_INDEX'::text,
  'GOVERNANCE_AGENT'::text
]));
