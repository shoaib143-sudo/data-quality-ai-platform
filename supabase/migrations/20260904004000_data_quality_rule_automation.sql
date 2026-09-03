create table if not exists profiling.quality_rule_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid references catalog.dataset_versions(id) on delete set null,
  column_name text,
  rule_key text not null,
  name text not null,
  description text,
  dimension text not null default 'VALIDITY',
  severity text not null default 'MEDIUM' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  metric_key text not null,
  operator text not null check (operator in ('LTE','GTE','EQ','NEQ')),
  threshold numeric,
  enabled boolean not null default true,
  origin text not null default 'SUGGESTED' check (origin in ('SUGGESTED','USER','SYSTEM')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quality_rule_definitions_identity
on profiling.quality_rule_definitions(dataset_id, coalesce(column_name,''), rule_key);

create table if not exists profiling.quality_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_definition_id uuid not null references profiling.quality_rule_definitions(id) on delete cascade,
  agent_run_id uuid references agent.agent_runs(id) on delete set null,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  status text not null default 'RUNNING' check (status in ('RUNNING','PASSED','FAILED','ERROR','CANCELLED')),
  passed boolean,
  observed_value numeric,
  threshold numeric,
  evidence jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists quality_rule_runs_profile_run_idx on profiling.quality_rule_runs(profile_run_id);
create index if not exists quality_rule_runs_agent_run_idx on profiling.quality_rule_runs(agent_run_id);
create index if not exists quality_rule_runs_rule_idx on profiling.quality_rule_runs(rule_definition_id, started_at desc);

alter table profiling.quality_rule_definitions enable row level security;
alter table profiling.quality_rule_runs enable row level security;

drop policy if exists quality_rule_definitions_select on profiling.quality_rule_definitions;
create policy quality_rule_definitions_select on profiling.quality_rule_definitions
for select to authenticated
using (app_private.is_project_member(project_id));

drop policy if exists quality_rule_definitions_write on profiling.quality_rule_definitions;
create policy quality_rule_definitions_write on profiling.quality_rule_definitions
for all to authenticated
using (app_private.is_project_member(project_id))
with check (app_private.is_project_member(project_id));

drop policy if exists quality_rule_runs_select on profiling.quality_rule_runs;
create policy quality_rule_runs_select on profiling.quality_rule_runs
for select to authenticated
using (
  exists (
    select 1
    from profiling.quality_rule_definitions qrd
    where qrd.id = quality_rule_runs.rule_definition_id
      and app_private.is_project_member(qrd.project_id)
  )
);

grant select, insert, update, delete on profiling.quality_rule_definitions to authenticated;
grant select on profiling.quality_rule_runs to authenticated;
grant all on profiling.quality_rule_definitions, profiling.quality_rule_runs to service_role;

insert into agent.agent_definitions (agent_key,name,version,description,system_prompt,enabled,configuration)
select
  'data_quality_agent',
  'Data Quality Agent',
  '1.0',
  'Executes governed data quality rules against persisted profiling evidence and records auditable pass/fail outcomes.',
  'Execute deterministic data quality controls only from persisted profiling evidence. Never invent observations. Persist every rule outcome with auditable evidence.',
  true,
  '{"execution_mode":"deterministic","source":"profiling_metrics"}'::jsonb
where not exists (
  select 1 from agent.agent_definitions where agent_key='data_quality_agent' and version='1.0'
);

insert into agent.tool_definitions (agent_definition_id,tool_key,name,version,description,enabled,input_schema,output_schema,execution_config)
select
  ad.id,
  v.tool_key,
  v.name,
  '1.0',
  v.description,
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"executor":"data_quality"}'::jsonb
from agent.agent_definitions ad
cross join (values
  ('sync_quality_rules','Sync quality rules','Creates or refreshes realistic rule suggestions from persisted profiling evidence.'),
  ('execute_quality_rules','Execute quality rules','Evaluates enabled quality rules deterministically against persisted profiling metrics.'),
  ('publish_quality_results','Publish quality results','Publishes auditable data quality outcomes for dashboard and monitoring use.')
) as v(tool_key,name,description)
where ad.agent_key='data_quality_agent' and ad.version='1.0'
  and not exists (
    select 1 from agent.tool_definitions td
    where td.agent_definition_id=ad.id and td.tool_key=v.tool_key and td.version='1.0'
  );

select pg_notify('pgrst','reload schema');
