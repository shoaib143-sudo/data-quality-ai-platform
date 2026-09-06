-- Module 15: Governance for AI systems. Inventory, immutable versions, assessments, and human deployment authority.

create table if not exists governance.ai_systems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  system_key text not null,
  name text not null,
  system_type text not null,
  lifecycle_status text not null default 'DRAFT',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(system_key)) > 0),
  check (length(btrim(name)) > 0),
  check (system_type in ('MODEL','AGENT','APPLICATION','PIPELINE','EXTERNAL_SERVICE')),
  check (lifecycle_status in ('DRAFT','ACTIVE','RETIRED')),
  unique(project_id, system_key)
);

create table if not exists governance.ai_system_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  ai_system_id uuid not null references governance.ai_systems(id) on delete restrict,
  version_number integer not null,
  provider text,
  model_name text,
  external_version text,
  configuration jsonb not null default '{}'::jsonb,
  intended_use text not null,
  risk_tier text not null,
  data_categories jsonb not null default '[]'::jsonb,
  human_oversight text not null,
  limitations text not null,
  semantic_hash text not null,
  created_at timestamptz not null default now(),
  check (version_number > 0),
  check (risk_tier in ('LOW','MEDIUM','HIGH','CRITICAL')),
  check (length(btrim(intended_use)) > 0),
  check (length(btrim(human_oversight)) > 0),
  check (length(btrim(limitations)) > 0),
  unique(ai_system_id, version_number),
  unique(ai_system_id, semantic_hash)
);

alter table governance.ai_systems
  drop constraint if exists ai_systems_current_version_fk;
alter table governance.ai_systems
  add constraint ai_systems_current_version_fk
  foreign key(current_version_id) references governance.ai_system_versions(id) on delete restrict;

create table if not exists governance.ai_system_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  ai_system_id uuid not null references governance.ai_systems(id) on delete restrict,
  version_id uuid not null references governance.ai_system_versions(id) on delete restrict,
  decision text not null,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_capability text not null default 'policy.approve',
  review_note text not null,
  created_at timestamptz not null default now(),
  check (decision in ('APPROVED','REJECTED','REVOKED')),
  check (length(btrim(review_note)) > 0)
);

create table if not exists governance.ai_system_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  ai_system_id uuid not null references governance.ai_systems(id) on delete restrict,
  version_id uuid not null references governance.ai_system_versions(id) on delete restrict,
  assessment_type text not null,
  result text not null,
  assessor_type text not null,
  assessor_user_id uuid references auth.users(id) on delete restrict,
  source_agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  evidence jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  check (assessment_type in ('RISK','PRIVACY','SECURITY','QUALITY','BIAS','HUMAN_OVERSIGHT','COMPLIANCE')),
  check (result in ('PASS','FAIL','PARTIAL','NOT_ASSESSED')),
  check (assessor_type in ('HUMAN','SYSTEM','AGENT'))
);

create index if not exists ai_systems_project_status_idx on governance.ai_systems(project_id,lifecycle_status,id);
create index if not exists ai_system_versions_project_created_idx on governance.ai_system_versions(project_id,created_at desc,id);
create index if not exists ai_system_decisions_version_created_idx on governance.ai_system_decisions(version_id,created_at desc,id);
create index if not exists ai_system_assessments_version_created_idx on governance.ai_system_assessments(version_id,created_at desc,id);

alter table governance.ai_systems enable row level security;
alter table governance.ai_system_versions enable row level security;
alter table governance.ai_system_decisions enable row level security;
alter table governance.ai_system_assessments enable row level security;

create policy ai_systems_read on governance.ai_systems for select to authenticated using(app_private.is_project_member(project_id));
create policy ai_system_versions_read on governance.ai_system_versions for select to authenticated using(app_private.is_project_member(project_id));
create policy ai_system_decisions_read on governance.ai_system_decisions for select to authenticated using(app_private.is_project_member(project_id));
create policy ai_system_assessments_read on governance.ai_system_assessments for select to authenticated using(app_private.is_project_member(project_id));

revoke all on governance.ai_systems, governance.ai_system_versions, governance.ai_system_decisions, governance.ai_system_assessments from public,anon,authenticated,service_role;
grant select on governance.ai_systems, governance.ai_system_versions, governance.ai_system_decisions, governance.ai_system_assessments to authenticated,service_role;

create or replace function governance.ai_system_evidence_immutable()
returns trigger language plpgsql
set search_path='pg_catalog','governance' as $$
begin
  raise exception 'AI system governance evidence is append-only';
end;
$$;
revoke all on function governance.ai_system_evidence_immutable() from public,anon,authenticated,service_role;

drop trigger if exists ai_system_versions_immutable on governance.ai_system_versions;
create trigger ai_system_versions_immutable before update or delete on governance.ai_system_versions
for each row execute function governance.ai_system_evidence_immutable();
drop trigger if exists ai_system_decisions_immutable on governance.ai_system_decisions;
create trigger ai_system_decisions_immutable before update or delete on governance.ai_system_decisions
for each row execute function governance.ai_system_evidence_immutable();
drop trigger if exists ai_system_assessments_immutable on governance.ai_system_assessments;
create trigger ai_system_assessments_immutable before update or delete on governance.ai_system_assessments
for each row execute function governance.ai_system_evidence_immutable();

create or replace function governance.register_ai_system_version(
  p_project_id uuid,
  p_system_key text,
  p_name text,
  p_system_type text,
  p_provider text,
  p_model_name text,
  p_external_version text,
  p_configuration jsonb,
  p_intended_use text,
  p_risk_tier text,
  p_data_categories jsonb,
  p_human_oversight text,
  p_limitations text
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance','extensions' as $$
declare
  v_system governance.ai_systems%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_version_number integer;
  v_type text := upper(btrim(coalesce(p_system_type,'')));
  v_risk text := upper(btrim(coalesce(p_risk_tier,'')));
  v_hash text;
begin
  if v_type not in ('MODEL','AGENT','APPLICATION','PIPELINE','EXTERNAL_SERVICE') then raise exception 'Unsupported AI system type'; end if;
  if v_risk not in ('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'Unsupported AI risk tier'; end if;
  if nullif(btrim(coalesce(p_system_key,'')),'') is null or nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'AI system key and name are required'; end if;
  if nullif(btrim(coalesce(p_intended_use,'')),'') is null or nullif(btrim(coalesce(p_human_oversight,'')),'') is null or nullif(btrim(coalesce(p_limitations,'')),'') is null then raise exception 'Intended use, human oversight, and limitations are required'; end if;

  insert into governance.ai_systems(project_id,system_key,name,system_type,lifecycle_status)
  values(p_project_id,btrim(p_system_key),btrim(p_name),v_type,'DRAFT')
  on conflict(project_id,system_key) do update set
    name=excluded.name,
    system_type=excluded.system_type,
    lifecycle_status='DRAFT',
    updated_at=now()
  returning * into v_system;

  select coalesce(max(version_number),0)+1 into v_version_number from governance.ai_system_versions where ai_system_id=v_system.id;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'project_id',p_project_id,'ai_system_id',v_system.id,'provider',p_provider,'model_name',p_model_name,
    'external_version',p_external_version,'configuration',coalesce(p_configuration,'{}'::jsonb),'intended_use',btrim(p_intended_use),
    'risk_tier',v_risk,'data_categories',coalesce(p_data_categories,'[]'::jsonb),'human_oversight',btrim(p_human_oversight),'limitations',btrim(p_limitations)
  )::text,'UTF8'),'sha256'),'hex');

  insert into governance.ai_system_versions(id,project_id,ai_system_id,version_number,provider,model_name,external_version,configuration,intended_use,risk_tier,data_categories,human_oversight,limitations,semantic_hash)
  values(v_version_id,p_project_id,v_system.id,v_version_number,p_provider,p_model_name,p_external_version,coalesce(p_configuration,'{}'::jsonb),btrim(p_intended_use),v_risk,coalesce(p_data_categories,'[]'::jsonb),btrim(p_human_oversight),btrim(p_limitations),v_hash);

  update governance.ai_systems set current_version_id=v_version_id,lifecycle_status='DRAFT',updated_at=now() where id=v_system.id;
  return v_version_id;
end;
$$;
revoke all on function governance.register_ai_system_version(uuid,text,text,text,text,text,text,jsonb,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function governance.register_ai_system_version(uuid,text,text,text,text,text,text,jsonb,text,text,jsonb,text,text) to service_role;

create or replace function governance.record_ai_system_assessment(
  p_version_id uuid,
  p_assessment_type text,
  p_result text,
  p_assessor_type text,
  p_assessor_user_id uuid default null,
  p_source_agent_run_id uuid default null,
  p_evidence jsonb default '{}'::jsonb,
  p_note text default null
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance','agent' as $$
declare
  v_version governance.ai_system_versions%rowtype;
  v_id uuid := gen_random_uuid();
  v_assessor text := upper(btrim(coalesce(p_assessor_type,'')));
  v_type text := upper(btrim(coalesce(p_assessment_type,'')));
  v_result text := upper(btrim(coalesce(p_result,'')));
begin
  select * into v_version from governance.ai_system_versions where id=p_version_id;
  if not found then raise exception 'AI system version not found'; end if;
  if v_type not in ('RISK','PRIVACY','SECURITY','QUALITY','BIAS','HUMAN_OVERSIGHT','COMPLIANCE') then raise exception 'Unsupported assessment type'; end if;
  if v_result not in ('PASS','FAIL','PARTIAL','NOT_ASSESSED') then raise exception 'Unsupported assessment result'; end if;
  if v_assessor not in ('HUMAN','SYSTEM','AGENT') then raise exception 'Unsupported assessor type'; end if;
  if v_assessor='HUMAN' then
    if p_assessor_user_id is null or not governance.has_project_capability(v_version.project_id,p_assessor_user_id,'policy.approve') then raise exception 'Human assessor lacks policy.approve'; end if;
    if p_source_agent_run_id is not null then raise exception 'Human assessment cannot claim agent provenance'; end if;
  elsif v_assessor='AGENT' then
    if p_source_agent_run_id is null or not exists(select 1 from agent.agent_runs r where r.id=p_source_agent_run_id and r.project_id=v_version.project_id) then raise exception 'Agent assessment requires a same-project source run'; end if;
    if p_assessor_user_id is not null then raise exception 'Agent assessment cannot claim human assessor identity'; end if;
  else
    if p_assessor_user_id is not null or p_source_agent_run_id is not null then raise exception 'System assessment cannot claim human or agent provenance'; end if;
  end if;

  insert into governance.ai_system_assessments(id,project_id,ai_system_id,version_id,assessment_type,result,assessor_type,assessor_user_id,source_agent_run_id,evidence,note)
  values(v_id,v_version.project_id,v_version.ai_system_id,v_version.id,v_type,v_result,v_assessor,p_assessor_user_id,p_source_agent_run_id,coalesce(p_evidence,'{}'::jsonb),p_note);
  return v_id;
end;
$$;
revoke all on function governance.record_ai_system_assessment(uuid,text,text,text,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function governance.record_ai_system_assessment(uuid,text,text,text,uuid,uuid,jsonb,text) to service_role;

create or replace function governance.review_ai_system_version(
  p_version_id uuid,
  p_reviewer uuid,
  p_decision text,
  p_review_note text
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance' as $$
declare
  v_version governance.ai_system_versions%rowtype;
  v_system governance.ai_systems%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_id uuid := gen_random_uuid();
begin
  select * into v_version from governance.ai_system_versions where id=p_version_id;
  if not found then raise exception 'AI system version not found'; end if;
  select * into v_system from governance.ai_systems where id=v_version.ai_system_id for update;
  if v_decision not in ('APPROVED','REJECTED','REVOKED') then raise exception 'Decision must be APPROVED, REJECTED, or REVOKED'; end if;
  if nullif(btrim(coalesce(p_review_note,'')),'') is null then raise exception 'Human review note is required'; end if;
  if not governance.has_project_capability(v_version.project_id,p_reviewer,'policy.approve') then raise exception 'Reviewer lacks policy.approve'; end if;

  insert into governance.ai_system_decisions(id,project_id,ai_system_id,version_id,decision,reviewer_user_id,reviewer_capability,review_note)
  values(v_id,v_version.project_id,v_version.ai_system_id,v_version.id,v_decision,p_reviewer,'policy.approve',btrim(p_review_note));

  if v_system.current_version_id=v_version.id then
    update governance.ai_systems set lifecycle_status=case when v_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end,updated_at=now() where id=v_system.id;
  end if;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_version.project_id,p_reviewer,'USER','AI_SYSTEM_VERSION_REVIEWED','AI_SYSTEM_VERSION',v_version.id,
    jsonb_build_object('decision',v_decision,'required_capability','policy.approve','authority_effect',case when v_decision='APPROVED' then 'CURRENT_VERSION_MAY_BECOME_ACTIVE' else 'NO_ACTIVE_AUTHORITY' end));
  return v_id;
end;
$$;
revoke all on function governance.review_ai_system_version(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_ai_system_version(uuid,uuid,text,text) to service_role;

create or replace view governance.ai_system_effective
with (security_invoker=true) as
select s.*,v.version_number,v.provider,v.model_name,v.external_version,v.intended_use,v.risk_tier,v.data_categories,v.human_oversight,v.limitations,v.semantic_hash,
  d.decision as latest_decision,d.reviewer_user_id,d.review_note,d.created_at as reviewed_at,
  case when s.lifecycle_status='ACTIVE' and d.decision='APPROVED' then 'HUMAN_APPROVED_CURRENT_VERSION' else 'NO_ACTIVE_DEPLOYMENT_AUTHORITY' end as authority_status
from governance.ai_systems s
left join governance.ai_system_versions v on v.id=s.current_version_id
left join lateral (
  select x.* from governance.ai_system_decisions x where x.version_id=s.current_version_id order by x.created_at desc,x.id desc limit 1
) d on true;
grant select on governance.ai_system_effective to authenticated,service_role;

create or replace function governance.verify_ai_system_governance_posture()
returns jsonb language sql stable security definer
set search_path='pg_catalog','governance' as $$
with counts as (
  select
    (select count(*) from governance.ai_systems) as systems,
    (select count(*) from governance.ai_system_versions) as versions,
    (select count(*) from governance.ai_system_assessments) as assessments,
    (select count(*) from governance.ai_system_decisions) as decisions
), integrity as (
  select
    (select count(*) from governance.ai_systems s where s.current_version_id is not null and not exists(select 1 from governance.ai_system_versions v where v.id=s.current_version_id and v.ai_system_id=s.id and v.project_id=s.project_id)) as invalid_current_versions,
    (select count(*) from governance.ai_system_versions v where not exists(select 1 from governance.ai_systems s where s.id=v.ai_system_id and s.project_id=v.project_id)) as orphan_versions,
    (select count(*) from governance.ai_system_assessments a where not exists(select 1 from governance.ai_system_versions v where v.id=a.version_id and v.ai_system_id=a.ai_system_id and v.project_id=a.project_id)) as orphan_assessments,
    (select count(*) from governance.ai_system_decisions d where not exists(select 1 from governance.ai_system_versions v where v.id=d.version_id and v.ai_system_id=d.ai_system_id and v.project_id=d.project_id)) as orphan_decisions,
    (select count(*) from governance.ai_systems s where s.lifecycle_status='ACTIVE' and not exists(
      select 1 from lateral (select d.* from governance.ai_system_decisions d where d.version_id=s.current_version_id order by d.created_at desc,d.id desc limit 1) latest
      where latest.decision='APPROVED' and latest.reviewer_user_id is not null and latest.reviewer_capability='policy.approve'
    )) as active_authority_violations
), triggers as (
  select
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='ai_system_versions' and t.tgname='ai_system_versions_immutable' and not t.tgisinternal and t.tgenabled<>'D') as versions_append_only,
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='ai_system_decisions' and t.tgname='ai_system_decisions_immutable' and not t.tgisinternal and t.tgenabled<>'D') as decisions_append_only,
    exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='governance' and c.relname='ai_system_assessments' and t.tgname='ai_system_assessments_immutable' and not t.tgisinternal and t.tgenabled<>'D') as assessments_append_only
), grants as (
  select
    has_table_privilege('anon','governance.ai_systems','INSERT') or has_table_privilege('anon','governance.ai_systems','UPDATE') or has_table_privilege('anon','governance.ai_systems','DELETE') or
    has_table_privilege('authenticated','governance.ai_systems','INSERT') or has_table_privilege('authenticated','governance.ai_systems','UPDATE') or has_table_privilege('authenticated','governance.ai_systems','DELETE') or
    has_table_privilege('anon','governance.ai_system_versions','INSERT') or has_table_privilege('authenticated','governance.ai_system_versions','INSERT') or
    has_table_privilege('anon','governance.ai_system_decisions','INSERT') or has_table_privilege('authenticated','governance.ai_system_decisions','INSERT') or
    has_table_privilege('anon','governance.ai_system_assessments','INSERT') or has_table_privilege('authenticated','governance.ai_system_assessments','INSERT') as browser_write,
    has_table_privilege('service_role','governance.ai_systems','INSERT') or has_table_privilege('service_role','governance.ai_systems','UPDATE') or has_table_privilege('service_role','governance.ai_systems','DELETE') as direct_service_system_write
)
select jsonb_build_object(
  'valid',i.invalid_current_versions=0 and i.orphan_versions=0 and i.orphan_assessments=0 and i.orphan_decisions=0 and i.active_authority_violations=0 and t.versions_append_only and t.decisions_append_only and t.assessments_append_only and not g.browser_write and not g.direct_service_system_write,
  'state',case when c.systems=0 then 'READY_NO_REGISTERED_AI_SYSTEMS' else 'READY' end,
  'systems',c.systems,'versions',c.versions,'assessments',c.assessments,'human_decisions',c.decisions,
  'invalid_current_versions',i.invalid_current_versions,'orphan_versions',i.orphan_versions,'orphan_assessments',i.orphan_assessments,'orphan_decisions',i.orphan_decisions,'active_authority_violations',i.active_authority_violations,
  'versions_append_only',t.versions_append_only,'decisions_append_only',t.decisions_append_only,'assessments_append_only',t.assessments_append_only,
  'browser_write',g.browser_write,'direct_service_system_write',g.direct_service_system_write,
  'authority_semantics','HUMAN_POLICY_APPROVAL_REQUIRED_FOR_EXACT_CURRENT_AI_SYSTEM_VERSION',
  'assessment_authority_effect','NO_AUTOMATIC_DEPLOYMENT_AUTHORITY'
) from counts c cross join integrity i cross join triggers t cross join grants g;
$$;
revoke all on function governance.verify_ai_system_governance_posture() from public,anon,authenticated;
grant execute on function governance.verify_ai_system_governance_posture() to service_role;
