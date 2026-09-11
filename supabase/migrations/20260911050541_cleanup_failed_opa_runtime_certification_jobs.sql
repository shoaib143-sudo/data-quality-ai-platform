delete from orchestration.job_queue
where status = 'DEAD'
  and idempotency_key in (
    'opa-production-runtime-certification-20260911-v1',
    'opa-production-runtime-certification-20260911-v2',
    'opa-production-runtime-certification-20260911-v3',
    'opa-production-runtime-certification-20260911-v4'
  );
