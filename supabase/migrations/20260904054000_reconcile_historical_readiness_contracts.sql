update profiling.profile_runs pr
set status='PARTIAL',
    error_code=coalesce(pr.error_code,'HISTORICAL_INCOMPLETE_PROFILE'),
    error_message=coalesce(pr.error_message,'Historical run was marked COMPLETED without persisted investigation evidence.'),
    summary=coalesce(pr.summary,'{}'::jsonb)||jsonb_build_object('historical_reconciliation','Reclassified from COMPLETED to PARTIAL because investigation evidence is missing.')
where pr.status='COMPLETED'
  and not (coalesce(pr.summary,'{}'::jsonb) ? 'investigation');

update catalog.dataset_versions dv
set status='PROCESSING',
    metadata=coalesce(dv.metadata,'{}'::jsonb)||jsonb_build_object(
      'profiling_ready',false,
      'readiness_reconciliation','Version was AVAILABLE without an active profiling execution source.'
    )
where dv.status='AVAILABLE'
  and not exists (
    select 1 from profiling.dataset_execution_sources des
    where des.dataset_version_id=dv.id and des.active=true
  );

select pg_notify('pgrst','reload schema');
