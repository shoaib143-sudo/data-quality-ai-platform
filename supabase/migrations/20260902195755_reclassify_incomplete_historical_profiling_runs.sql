update profiling.profile_runs
set status='PARTIAL',
    error_code=coalesce(error_code,'HISTORICAL_INCOMPLETE_METRICS'),
    error_message=coalesce(error_message,'Historical run was missing distribution metric executions and has been reclassified as PARTIAL.'),
    summary=coalesce(summary,'{}'::jsonb) || jsonb_build_object('historical_repair',jsonb_build_object('reclassified',true,'reason','missing distribution metric executions under current profiling metric registry'))
where id='9ec84ae1-9ea3-41f2-b6ef-77654d0c0302' and status='COMPLETED';

insert into profiling.metric_repair_audit (profile_run_id, metric_definition_id, metric_key, action, details)
select '9ec84ae1-9ea3-41f2-b6ef-77654d0c0302', id, metric_key, 'RECLASSIFY_INCOMPLETE_PROFILE_RUN', jsonb_build_object('reason','missing distribution metric executions under current profiling metric registry')
from profiling.metric_definitions where enabled=true and scope='DISTRIBUTION';
