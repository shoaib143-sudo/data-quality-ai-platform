-- Lineage Impact Intelligence
-- Durable blast-radius analysis with evidence, risk and confidence per affected asset.

create table if not exists governance.lineage_impact_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  root_asset_type text not null,
  root_asset_id uuid not null,
  root_asset_name text,
  trigger_type text,
  trigger_id uuid,
  direction text not null default 'DOWNSTREAM' check (direction in ('DOWNSTREAM','UPSTREAM')),
  max_depth integer not null default 5 check (max_depth between 1 and 20),
  affected_count integer not null default 0 check (affected_count >= 0),
  critical_affected_count integer not null default 0 check (critical_affected_count >= 0),
  risk_score numeric not null default 0 check (risk_score >= 0 and risk_score <= 1),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lineage_impact_analyses_project_idx
  on governance.lineage_impact_analyses(project_id,created_at desc);
create index if not exists lineage_impact_analyses_root_idx
  on governance.lineage_impact_analyses(project_id,root_asset_type,root_asset_id,created_at desc);
create index if not exists lineage_impact_analyses_trigger_idx
  on governance.lineage_impact_analyses(project_id,trigger_type,trigger_id)
  where trigger_id is not null;

create table if not exists governance.lineage_impact_nodes (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references governance.lineage_impact_analyses(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  asset_type text not null,
  asset_id uuid not null,
  asset_name text,
  distance integer not null check (distance >= 1),
  path jsonb not null default '[]'::jsonb,
  criticality text,
  certification_status text,
  risk_score numeric not null default 0 check (risk_score >= 0 and risk_score <= 1),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(analysis_id,asset_type,asset_id)
);

create index if not exists lineage_impact_nodes_analysis_idx
  on governance.lineage_impact_nodes(analysis_id,risk_score desc,distance asc);
create index if not exists lineage_impact_nodes_asset_idx
  on governance.lineage_impact_nodes(project_id,asset_type,asset_id);

alter table governance.lineage_impact_analyses enable row level security;
alter table governance.lineage_impact_nodes enable row level security;

drop policy if exists lineage_impact_analyses_read on governance.lineage_impact_analyses;
create policy lineage_impact_analyses_read on governance.lineage_impact_analyses
for select to authenticated using (app_private.is_project_member(project_id));

drop policy if exists lineage_impact_nodes_read on governance.lineage_impact_nodes;
create policy lineage_impact_nodes_read on governance.lineage_impact_nodes
for select to authenticated using (app_private.is_project_member(project_id));

grant select on governance.lineage_impact_analyses,governance.lineage_impact_nodes to authenticated;
grant all on governance.lineage_impact_analyses,governance.lineage_impact_nodes to service_role;

drop trigger if exists trg_audit_lineage_impact_analyses on governance.lineage_impact_analyses;
create trigger trg_audit_lineage_impact_analyses
  after insert or update or delete on governance.lineage_impact_analyses
  for each row execute function governance.audit_project_table_change();

select pg_notify('pgrst','reload schema');
