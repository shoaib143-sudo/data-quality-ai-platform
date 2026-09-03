create table if not exists governance.retention_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references app.projects(id) on delete cascade,
  profile_history_days integer not null default 365 check (profile_history_days >= 30),
  agent_job_history_days integer not null default 180 check (agent_job_history_days >= 30),
  minimum_profile_runs integer not null default 5 check (minimum_profile_runs between 2 and 100),
  minimum_agent_runs integer not null default 50 check (minimum_agent_runs between 10 and 1000),
  enabled boolean not null default false,
  legal_hold boolean not null default false,
  last_executed_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists governance.retention_archive (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  entity_type text not null check (entity_type in ('PROFILE_RUN','AGENT_RUN')),
  entity_id uuid not null,
  occurred_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  unique(entity_type,entity_id)
);
create index if not exists retention_archive_project_idx on governance.retention_archive(project_id,archived_at desc);

alter table governance.retention_policies enable row level security;
alter table governance.retention_archive enable row level security;

drop policy if exists retention_policies_project_access on governance.retention_policies;
create policy retention_policies_project_access on governance.retention_policies
for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));

drop policy if exists retention_archive_project_access on governance.retention_archive;
create policy retention_archive_project_access on governance.retention_archive
for select to authenticated using (app_private.is_project_member(project_id));

grant select,insert,update on governance.retention_policies to authenticated;
grant select on governance.retention_archive to authenticated;
grant all on governance.retention_policies,governance.retention_archive to service_role;

create or replace function governance.apply_retention_policy(p_project_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,governance,profiling,agent,catalog,app
as $function$
declare
  v_policy governance.retention_policies%rowtype;
  v_profile_archived integer := 0;
  v_profile_deleted integer := 0;
  v_agent_archived integer := 0;
  v_agent_deleted integer := 0;
  v_result jsonb;
begin
  select * into v_policy from governance.retention_policies where project_id=p_project_id for update;
  if not found then return jsonb_build_object('status','NO_POLICY','project_id',p_project_id); end if;
  if not v_policy.enabled then return jsonb_build_object('status','DISABLED','project_id',p_project_id); end if;
  if v_policy.legal_hold then return jsonb_build_object('status','LEGAL_HOLD','project_id',p_project_id); end if;

  with ranked as (
    select pr.id,pr.status,pr.started_at,pr.completed_at,pr.row_count,pr.column_count,pr.schema_hash,pr.summary,dv.dataset_id,
           row_number() over(partition by dv.dataset_id order by coalesce(pr.completed_at,pr.started_at) desc nulls last) rn
    from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and pr.status in ('COMPLETED','FAILED','CANCELLED','PARTIAL')
      and coalesce(pr.completed_at,pr.started_at)<now()-make_interval(days=>v_policy.profile_history_days)
  ), candidates as (select * from ranked where rn>v_policy.minimum_profile_runs)
  insert into governance.retention_archive(project_id,entity_type,entity_id,occurred_at,summary)
  select p_project_id,'PROFILE_RUN',c.id,coalesce(c.completed_at,c.started_at),
         jsonb_build_object('dataset_id',c.dataset_id,'status',c.status,'row_count',c.row_count,'column_count',c.column_count,'schema_hash',c.schema_hash,'profile_summary',c.summary)
  from candidates c on conflict(entity_type,entity_id) do nothing;
  get diagnostics v_profile_archived=row_count;

  with ranked as (
    select pr.id,dv.dataset_id,row_number() over(partition by dv.dataset_id order by coalesce(pr.completed_at,pr.started_at) desc nulls last) rn
    from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and pr.status in ('COMPLETED','FAILED','CANCELLED','PARTIAL')
      and coalesce(pr.completed_at,pr.started_at)<now()-make_interval(days=>v_policy.profile_history_days)
  ), candidates as (select id from ranked where rn>v_policy.minimum_profile_runs)
  delete from profiling.profile_runs pr using candidates c
  where pr.id=c.id and exists(select 1 from governance.retention_archive a where a.entity_type='PROFILE_RUN' and a.entity_id=pr.id);
  get diagnostics v_profile_deleted=row_count;

  with ranked as (
    select ar.id,ar.status,ar.created_at,ar.started_at,ar.completed_at,ar.dataset_id,ar.dataset_version_id,ar.error_code,ar.error_message,
           row_number() over(order by ar.created_at desc) rn
    from agent.agent_runs ar
    where ar.project_id=p_project_id and ar.status in ('SUCCEEDED','FAILED','CANCELLED','COMPLETED')
      and coalesce(ar.completed_at,ar.started_at,ar.created_at)<now()-make_interval(days=>v_policy.agent_job_history_days)
  ), candidates as (select * from ranked where rn>v_policy.minimum_agent_runs)
  insert into governance.retention_archive(project_id,entity_type,entity_id,occurred_at,summary)
  select p_project_id,'AGENT_RUN',c.id,coalesce(c.completed_at,c.started_at,c.created_at),
         jsonb_build_object('status',c.status,'dataset_id',c.dataset_id,'dataset_version_id',c.dataset_version_id,'error_code',c.error_code,'error_message',c.error_message)
  from candidates c on conflict(entity_type,entity_id) do nothing;
  get diagnostics v_agent_archived=row_count;

  with ranked as (
    select ar.id,row_number() over(order by ar.created_at desc) rn
    from agent.agent_runs ar
    where ar.project_id=p_project_id and ar.status in ('SUCCEEDED','FAILED','CANCELLED','COMPLETED')
      and coalesce(ar.completed_at,ar.started_at,ar.created_at)<now()-make_interval(days=>v_policy.agent_job_history_days)
  ), candidates as (select id from ranked where rn>v_policy.minimum_agent_runs)
  delete from agent.agent_runs ar using candidates c
  where ar.id=c.id and exists(select 1 from governance.retention_archive a where a.entity_type='AGENT_RUN' and a.entity_id=ar.id);
  get diagnostics v_agent_deleted=row_count;

  v_result=jsonb_build_object('status','COMPLETED','project_id',p_project_id,'profile_runs_archived',v_profile_archived,'profile_runs_deleted',v_profile_deleted,'agent_runs_archived',v_agent_archived,'agent_runs_deleted',v_agent_deleted,'executed_at',now());
  update governance.retention_policies set last_executed_at=now(),last_result=v_result,updated_at=now() where project_id=p_project_id;
  return v_result;
end;
$function$;

create or replace function governance.apply_all_retention_policies()
returns jsonb language plpgsql security definer set search_path=pg_catalog,governance
as $function$
declare v_policy record; v_results jsonb := '[]'::jsonb;
begin
  for v_policy in select project_id from governance.retention_policies where enabled=true and legal_hold=false loop
    v_results=v_results||jsonb_build_array(governance.apply_retention_policy(v_policy.project_id));
  end loop;
  return v_results;
end;
$function$;

revoke execute on function governance.apply_retention_policy(uuid) from public,anon,authenticated;
revoke execute on function governance.apply_all_retention_policies() from public,anon,authenticated;
grant execute on function governance.apply_retention_policy(uuid) to service_role;
grant execute on function governance.apply_all_retention_policies() to service_role;

select cron.schedule('dgp-retention-policy','43 2 * * *','select governance.apply_all_retention_policies();')
where not exists(select 1 from cron.job where jobname='dgp-retention-policy');

select pg_notify('pgrst','reload schema');
