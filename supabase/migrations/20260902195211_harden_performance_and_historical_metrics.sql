-- Production hardening: remove duplicate indexes, add missing FK coverage,
-- repair the known legacy metric-identity corruption, and enforce the
-- execution-identity uniqueness contract at the database boundary.

create table if not exists profiling.metric_repair_audit (
  id uuid primary key default gen_random_uuid(),
  profile_run_id uuid not null references profiling.profile_runs(id),
  profile_metric_id uuid,
  metric_definition_id uuid not null references profiling.metric_definitions(id),
  metric_key text not null,
  original_profile_column_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

with legacy_rows as (
  select pm.id, pm.profile_run_id, pm.metric_definition_id, pm.metric_key, pm.profile_column_id,
    row_number() over (partition by pm.profile_run_id, pm.metric_definition_id order by pm.created_at asc, pm.id asc) as rn
  from profiling.profile_metrics pm
  join profiling.profile_runs pr on pr.id = pm.profile_run_id
  join profiling.metric_definitions md on md.id = pm.metric_definition_id
  where pr.status = 'COMPLETED' and md.scope = 'DATASET' and pm.profile_column_id is not null
)
insert into profiling.metric_repair_audit (profile_run_id, profile_metric_id, metric_definition_id, metric_key, original_profile_column_id, action, details)
select profile_run_id, id, metric_definition_id, metric_key, profile_column_id,
  case when rn = 1 then 'NORMALIZE_DATASET_METRIC_IDENTITY' else 'DELETE_DUPLICATE_DATASET_METRIC' end,
  jsonb_build_object('row_number', rn, 'reason', 'legacy dataset metric rows incorrectly carried profile_column_id')
from legacy_rows;

with legacy_rows as (
  select pm.id, row_number() over (partition by pm.profile_run_id, pm.metric_definition_id order by pm.created_at asc, pm.id asc) as rn
  from profiling.profile_metrics pm
  join profiling.profile_runs pr on pr.id=pm.profile_run_id
  join profiling.metric_definitions md on md.id=pm.metric_definition_id
  where pr.status='COMPLETED' and md.scope='DATASET' and pm.profile_column_id is not null
)
delete from profiling.profile_metrics pm using legacy_rows lr where pm.id=lr.id and lr.rn>1;

with legacy_rows as (
  select pm.id, row_number() over (partition by pm.profile_run_id, pm.metric_definition_id order by pm.created_at asc, pm.id asc) as rn
  from profiling.profile_metrics pm
  join profiling.profile_runs pr on pr.id=pm.profile_run_id
  join profiling.metric_definitions md on md.id=pm.metric_definition_id
  where pr.status='COMPLETED' and md.scope='DATASET' and pm.profile_column_id is not null
)
update profiling.profile_metrics pm set profile_column_id=null from legacy_rows lr where pm.id=lr.id and lr.rn=1;

update profiling.profile_runs
set status='PARTIAL',
    error_code=coalesce(error_code,'HISTORICAL_INCOMPLETE_METRICS'),
    error_message=coalesce(error_message,'Historical run was missing enabled metric executions and has been reclassified as PARTIAL.'),
    summary=coalesce(summary,'{}'::jsonb) || jsonb_build_object('historical_repair',jsonb_build_object('reclassified',true,'reason','incomplete metric execution set under current persistence contract'))
where id='bf38ba8d-d9b2-424e-a010-c4df05556081' and status='COMPLETED';

create unique index if not exists uq_profile_metrics_execution_identity
on profiling.profile_metrics (profile_run_id, metric_definition_id, coalesce(profile_column_id,'00000000-0000-0000-0000-000000000000'::uuid));

drop index if exists agent.idx_agent_steps_run;
drop index if exists agent.agent_runs_dataset_idx;
drop index if exists agent.agent_runs_project_created_idx;
drop index if exists catalog.idx_data_sources_project;
drop index if exists catalog.idx_datasets_project;
drop index if exists profiling.profile_runs_dataset_started_idx;
create index if not exists profile_anomalies_metric_idx on profiling.profile_anomalies(metric_definition_id);
