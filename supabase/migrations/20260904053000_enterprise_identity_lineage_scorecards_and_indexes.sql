create table if not exists governance.sso_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  domain text not null,
  provider_id uuid,
  auto_join boolean not null default false,
  default_role text not null default 'MEMBER' check(default_role in ('MEMBER','ADMIN')),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sso_domains_domain_unique on governance.sso_domains(lower(domain));

create table if not exists governance.scim_directories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  default_role text not null default 'MEMBER' check(default_role in ('MEMBER','ADMIN')),
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(organization_id,name)
);

alter table governance.sso_domains enable row level security;
alter table governance.scim_directories enable row level security;
drop policy if exists sso_domains_admin on governance.sso_domains;
create policy sso_domains_admin on governance.sso_domains for all to authenticated
using(app_private.is_org_admin(organization_id)) with check(app_private.is_org_admin(organization_id));
drop policy if exists scim_directories_admin on governance.scim_directories;
create policy scim_directories_admin on governance.scim_directories for all to authenticated
using(app_private.is_org_admin(organization_id)) with check(app_private.is_org_admin(organization_id));
grant select,insert,update,delete on governance.sso_domains,governance.scim_directories to authenticated;
grant all on governance.sso_domains,governance.scim_directories to service_role;

create table if not exists governance.lineage_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_key text not null,
  name text not null,
  integration_type text not null default 'OPENLINEAGE',
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,source_key)
);
create table if not exists governance.lineage_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  integration_id uuid references governance.lineage_integrations(id) on delete set null,
  namespace text not null default '',
  name text not null,
  asset_type text not null default 'DATASET',
  dataset_id uuid references catalog.datasets(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(project_id,namespace,name,asset_type)
);
create table if not exists governance.lineage_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  integration_id uuid references governance.lineage_integrations(id) on delete set null,
  external_event_id text not null,
  event_type text not null,
  job_namespace text,
  job_name text,
  payload_hash text not null,
  edge_count integer not null default 0,
  status text not null default 'COMPLETED' check(status in ('COMPLETED','FAILED')),
  error_message text,
  received_at timestamptz not null default now(),
  unique(project_id,external_event_id)
);
alter table governance.lineage_integrations enable row level security;
alter table governance.lineage_assets enable row level security;
alter table governance.lineage_ingestion_events enable row level security;
drop policy if exists lineage_integrations_access on governance.lineage_integrations;
create policy lineage_integrations_access on governance.lineage_integrations for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists lineage_assets_read on governance.lineage_assets;
create policy lineage_assets_read on governance.lineage_assets for select to authenticated using(app_private.is_project_member(project_id));
drop policy if exists lineage_ingestion_events_read on governance.lineage_ingestion_events;
create policy lineage_ingestion_events_read on governance.lineage_ingestion_events for select to authenticated using(app_private.is_project_member(project_id));
grant select,insert,update,delete on governance.lineage_integrations to authenticated;
grant select on governance.lineage_assets,governance.lineage_ingestion_events to authenticated;
grant all on governance.lineage_integrations,governance.lineage_assets,governance.lineage_ingestion_events to service_role;

create table if not exists governance.project_scorecard_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  overall_score numeric not null check(overall_score between 0 and 1),
  dimensions jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);
create index if not exists project_scorecard_snapshots_project_idx on governance.project_scorecard_snapshots(project_id,calculated_at desc);
alter table governance.project_scorecard_snapshots enable row level security;
drop policy if exists project_scorecard_snapshots_read on governance.project_scorecard_snapshots;
create policy project_scorecard_snapshots_read on governance.project_scorecard_snapshots for select to authenticated using(app_private.is_project_member(project_id));
grant select on governance.project_scorecard_snapshots to authenticated;
grant all on governance.project_scorecard_snapshots to service_role;

create or replace function governance.refresh_project_scorecard(p_project_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,governance,profiling,catalog,app
as $$
declare
  v_total integer:=0; v_catalog integer:=0; v_stewarded integer:=0; v_profiled integer:=0; v_certified integer:=0; v_contracts integer:=0;
  v_healthy integer:=0; v_quality numeric:=0; v_quality_count integer:=0; v_overdue integer:=0;
  v_dimensions jsonb; v_evidence jsonb; v_overall numeric; v_id uuid;
begin
  select count(*) into v_total from catalog.datasets where project_id=p_project_id;
  select count(*) into v_catalog from governance.dataset_catalog where project_id=p_project_id;
  select count(distinct dataset_id) into v_stewarded from governance.stewardship_assignments where project_id=p_project_id and active=true and role in ('BUSINESS_OWNER','DATA_STEWARD');
  select count(*) into v_certified from governance.dataset_catalog where project_id=p_project_id and certification_status='CERTIFIED';
  select count(*) into v_contracts from governance.data_contracts where project_id=p_project_id and status='ACTIVE';
  select count(*) into v_overdue from governance.issues where project_id=p_project_id and status not in ('RESOLVED','CLOSED') and due_at is not null and due_at<now();
  with latest as (
    select distinct on (dv.dataset_id) dv.dataset_id,pr.id,pr.completed_at
    from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and pr.status='COMPLETED'
    order by dv.dataset_id,pr.completed_at desc nulls last,pr.started_at desc
  )
  select count(*) filter(where completed_at>=now()-interval '30 days'),coalesce(avg(s.overall_score),0),count(s.overall_score)
  into v_profiled,v_quality,v_quality_count from latest l left join profiling.data_quality_scores s on s.profile_run_id=l.id;
  select count(*) into v_healthy from catalog.datasets d where d.project_id=p_project_id and not exists(
    select 1 from profiling.observability_alerts a where a.dataset_id=d.id and a.status<>'RESOLVED' and a.severity in ('HIGH','CRITICAL')
  );
  v_dimensions:=jsonb_build_object(
    'catalog_coverage',case when v_total=0 then 1 else v_catalog::numeric/v_total end,
    'stewardship_coverage',case when v_total=0 then 1 else v_stewarded::numeric/v_total end,
    'profiling_freshness',case when v_total=0 then 1 else v_profiled::numeric/v_total end,
    'quality_health',case when v_quality_count=0 then 0 else least(1,greatest(0,v_quality)) end,
    'observability_health',case when v_total=0 then 1 else v_healthy::numeric/v_total end,
    'certification_coverage',case when v_total=0 then 1 else v_certified::numeric/v_total end,
    'contract_coverage',case when v_total=0 then 1 else v_contracts::numeric/v_total end,
    'remediation_health',case when v_total=0 then 1 else greatest(0,1-least(1,v_overdue::numeric/greatest(v_total,1))) end
  );
  select avg(value::numeric) into v_overall from jsonb_each_text(v_dimensions);
  v_overall:=least(1,greatest(0,coalesce(v_overall,0)));
  v_evidence:=jsonb_build_object('datasets',v_total,'cataloged',v_catalog,'stewarded',v_stewarded,'profiled_last_30d',v_profiled,'quality_scores',v_quality_count,'healthy_without_high_alerts',v_healthy,'certified',v_certified,'active_contracts',v_contracts,'overdue_issues',v_overdue);
  insert into governance.project_scorecard_snapshots(project_id,overall_score,dimensions,evidence) values(p_project_id,v_overall,v_dimensions,v_evidence) returning id into v_id;
  return jsonb_build_object('id',v_id,'project_id',p_project_id,'overall_score',v_overall,'dimensions',v_dimensions,'evidence',v_evidence,'calculated_at',now());
end;
$$;
revoke execute on function governance.refresh_project_scorecard(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_project_scorecard(uuid) to service_role;
create or replace function governance.refresh_all_project_scorecards() returns jsonb language plpgsql security definer set search_path=pg_catalog,governance,app as $$ declare r record; v jsonb:='[]'::jsonb; begin for r in select id from app.projects loop v:=v||jsonb_build_array(governance.refresh_project_scorecard(r.id)); end loop; return v; end $$;
revoke execute on function governance.refresh_all_project_scorecards() from public,anon,authenticated;
grant execute on function governance.refresh_all_project_scorecards() to service_role;
do $$ declare v_job bigint; begin select jobid into v_job from cron.job where jobname='dgp-governance-scorecards' limit 1; if v_job is not null then perform cron.unschedule(v_job); end if; perform cron.schedule('dgp-governance-scorecards','23 * * * *','select governance.refresh_all_project_scorecards();'); end $$;

create index if not exists discovered_assets_source_idx on catalog.discovered_assets(source_id);
create index if not exists discovery_runs_project_idx on catalog.discovery_runs(project_id);
create index if not exists discovery_runs_source_idx on catalog.discovery_runs(source_id);
create index if not exists certification_requests_project_idx on governance.certification_requests(project_id);
create index if not exists certification_requests_dataset_idx on governance.certification_requests(dataset_id);
create index if not exists data_contract_evaluations_project_idx on governance.data_contract_evaluations(project_id);
create index if not exists data_contract_evaluations_contract_idx on governance.data_contract_evaluations(contract_id);
create index if not exists data_contract_evaluations_dataset_idx on governance.data_contract_evaluations(dataset_id);
create index if not exists data_contract_evaluations_profile_idx on governance.data_contract_evaluations(profile_run_id);
create index if not exists data_contracts_project_idx on governance.data_contracts(project_id);
create index if not exists dataset_catalog_project_idx on governance.dataset_catalog(project_id);
create index if not exists dataset_classifications_project_idx on governance.dataset_classifications(project_id);
create index if not exists issues_project_idx on governance.issues(project_id);
create index if not exists issues_dataset_idx on governance.issues(dataset_id) where dataset_id is not null;
create index if not exists issues_dataset_version_idx on governance.issues(dataset_version_id) where dataset_version_id is not null;
create index if not exists issues_profile_run_idx on governance.issues(profile_run_id) where profile_run_id is not null;
create index if not exists issues_quality_rule_run_idx on governance.issues(quality_rule_run_id) where quality_rule_run_id is not null;
create index if not exists project_role_bindings_user_idx on governance.project_role_bindings(user_id);
create index if not exists workflow_actions_instance_idx on governance.workflow_actions(workflow_instance_id);
create index if not exists workflow_instances_project_idx on governance.workflow_instances(project_id);
create index if not exists workflow_instances_definition_idx on governance.workflow_instances(workflow_definition_id);
create index if not exists job_schedules_project_idx on orchestration.job_schedules(project_id);
create index if not exists job_schedules_dataset_version_idx on orchestration.job_schedules(dataset_version_id);
create index if not exists platform_telemetry_project_idx on orchestration.platform_telemetry(project_id);
create index if not exists notification_deliveries_alert_idx on profiling.notification_deliveries(alert_id);
create index if not exists notification_routes_project_idx on profiling.notification_routes(project_id);
create index if not exists notification_routes_channel_idx on profiling.notification_routes(channel_id);
create index if not exists observability_alerts_dataset_version_idx on profiling.observability_alerts(dataset_version_id) where dataset_version_id is not null;
create index if not exists observability_alerts_profile_run_idx on profiling.observability_alerts(profile_run_id) where profile_run_id is not null;
create index if not exists observability_policies_project_idx on profiling.observability_policies(project_id);
create index if not exists quality_rule_definitions_project_idx on profiling.quality_rule_definitions(project_id);
create index if not exists quality_rule_exceptions_rule_idx on profiling.quality_rule_exceptions(rule_definition_id);
create index if not exists quality_rule_exceptions_dataset_version_idx on profiling.quality_rule_exceptions(dataset_version_id);
create index if not exists quality_rule_runs_dataset_version_idx on profiling.quality_rule_runs(dataset_version_id);
create index if not exists quality_quarantine_project_idx on profiling.quality_quarantine_records(project_id);
create index if not exists quality_quarantine_dataset_version_idx on profiling.quality_quarantine_records(dataset_version_id);
create index if not exists stewardship_assignments_project_idx on governance.stewardship_assignments(project_id);
create index if not exists stewardship_assignments_user_idx on governance.stewardship_assignments(user_id);

create policy jdbc_customers_explicit_deny on jdbc_test.customers for all to authenticated using(false) with check(false);
create policy synthetic_customers_explicit_deny on profiling_validation.synthetic_customers for all to authenticated using(false) with check(false);

select pg_notify('pgrst','reload schema');
