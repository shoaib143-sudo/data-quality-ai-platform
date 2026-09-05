create table if not exists catalog.asset_promotion_requests(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  identity_key text not null,
  discovered_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  status text not null default 'RECOMMENDED' check(status in ('RECOMMENDED','REQUESTED','APPROVED','REJECTED','WITHDRAWN','PROMOTED')),
  recommendation_source text not null default 'AI' check(recommendation_source in ('AI','SYSTEM','HUMAN')),
  confidence numeric(5,4) check(confidence is null or (confidence>=0 and confidence<=1)),
  rationale text,
  recommendations jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  dataset_id uuid references catalog.datasets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists asset_promotion_open_identity_uq on catalog.asset_promotion_requests(source_id,identity_key) where status in ('RECOMMENDED','REQUESTED','APPROVED');
create index if not exists asset_promotion_project_status_idx on catalog.asset_promotion_requests(project_id,status,updated_at desc);
alter table catalog.asset_promotion_requests enable row level security;
create policy asset_promotion_requests_select on catalog.asset_promotion_requests for select to authenticated using(app_private.is_project_member(project_id));
grant select on catalog.asset_promotion_requests to authenticated;

create table if not exists catalog.asset_trust_assessments(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  identity_key text not null,
  catalog_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  trust_score numeric(5,4) not null check(trust_score between 0 and 1),
  dimensions jsonb not null,
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  assessor_type text not null default 'SYSTEM' check(assessor_type in ('SYSTEM','AI','HUMAN')),
  model_version text not null default 'EXPLAINABLE_TRUST_V1',
  created_at timestamptz not null default now()
);
create index if not exists asset_trust_assessments_identity_idx on catalog.asset_trust_assessments(source_id,identity_key,created_at desc);
alter table catalog.asset_trust_assessments enable row level security;
create policy asset_trust_assessments_select on catalog.asset_trust_assessments for select to authenticated using(app_private.is_project_member(project_id));
grant select on catalog.asset_trust_assessments to authenticated;

create or replace view catalog.current_asset_trust with (security_invoker=true) as
with base as (
  select s.project_id,s.source_id,s.scope_id,s.identity_key,s.asset_key,s.presence_state,s.last_seen_at,a.id discovered_asset_id,a.metadata,a.namespace,a.name,
         case when s.presence_state='ACTIVE' then 1.0 when s.presence_state='MISSING' then 0.45 when s.presence_state='INACCESSIBLE' then 0.35 else 0.0 end physical_presence,
         case when s.last_seen_at is null then 0.0 when s.last_seen_at>=now()-interval '1 day' then 1.0 when s.last_seen_at>=now()-interval '7 days' then 0.85 when s.last_seen_at>=now()-interval '30 days' then 0.65 else 0.35 end observation_recency,
         case when s.identity_key like 'native:%' then 1.0 else 0.6 end identity_strength,
         av.annotations
  from catalog.scope_asset_state s
  left join catalog.discovered_assets a on a.id=s.discovered_asset_id
  left join catalog.source_annotation_versions av on av.source_id=s.source_id and av.identity_key=s.identity_key and av.is_current
), scored as (
  select *,
    case when coalesce(annotations,'{}'::jsonb) ? 'owner' and coalesce(nullif(annotations->>'owner',''),'')<>'' then 0.5 else 0 end
    + case when (coalesce(annotations,'{}'::jsonb) ? 'comment' and coalesce(nullif(annotations->>'comment',''),'')<>'') or (coalesce(annotations,'{}'::jsonb) ? 'description' and coalesce(nullif(annotations->>'description',''),'')<>'') then 0.5 else 0 end annotation_completeness
  from base
)
select project_id,source_id,scope_id,identity_key,asset_key,presence_state,last_seen_at,discovered_asset_id,namespace,name,
       round((physical_presence*0.40+observation_recency*0.25+identity_strength*0.20+annotation_completeness*0.15)::numeric,4) trust_score,
       jsonb_build_object(
         'physical_presence',jsonb_build_object('score',physical_presence,'weight',0.40,'evidence',presence_state),
         'observation_recency',jsonb_build_object('score',observation_recency,'weight',0.25,'last_seen_at',last_seen_at),
         'identity_strength',jsonb_build_object('score',identity_strength,'weight',0.20,'native_identity',identity_key like 'native:%'),
         'source_annotation_completeness',jsonb_build_object('score',annotation_completeness,'weight',0.15,'annotations',coalesce(annotations,'{}'::jsonb))
       ) dimensions,
       'Trust score is evidence-weighted and explainable; it is not certification.'::text explanation,
       'NOT_CERTIFIED'::text certification_state
from scored;
grant select on catalog.current_asset_trust to authenticated;

create or replace function catalog.recommend_asset_promotion(p_source_id uuid,p_identity_key text,p_confidence numeric,p_rationale text,p_recommendations jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=catalog,public as $$
declare v_source catalog.data_sources%rowtype; v_asset catalog.discovered_assets%rowtype; v_id uuid;
begin
  select * into v_source from catalog.data_sources where id=p_source_id;
  if not found then raise exception 'Source not found'; end if;
  select * into v_asset from catalog.discovered_assets where source_id=p_source_id and identity_key=p_identity_key and is_current order by last_seen_at desc limit 1;
  if not found then raise exception 'Current discovered asset not found'; end if;
  select id into v_id from catalog.asset_promotion_requests where source_id=p_source_id and identity_key=p_identity_key and status in ('RECOMMENDED','REQUESTED','APPROVED') order by updated_at desc limit 1 for update;
  if v_id is null then
    insert into catalog.asset_promotion_requests(project_id,source_id,identity_key,discovered_asset_id,status,recommendation_source,confidence,rationale,recommendations)
    values(v_source.project_id,p_source_id,p_identity_key,v_asset.id,'RECOMMENDED','AI',p_confidence,p_rationale,coalesce(p_recommendations,'{}'::jsonb)) returning id into v_id;
  else
    update catalog.asset_promotion_requests set discovered_asset_id=v_asset.id,confidence=p_confidence,rationale=p_rationale,recommendations=coalesce(p_recommendations,'{}'::jsonb),updated_at=now() where id=v_id and status='RECOMMENDED';
  end if;
  return v_id;
end $$;

create or replace function catalog.request_asset_promotion(p_request_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=catalog,public as $$
begin
  if p_actor is null then raise exception 'Human actor is required'; end if;
  update catalog.asset_promotion_requests set status='REQUESTED',requested_by=p_actor,requested_at=now(),updated_at=now() where id=p_request_id and status='RECOMMENDED';
  if not found then raise exception 'Promotion recommendation is not requestable'; end if;
end $$;

create or replace function catalog.decide_asset_promotion(p_request_id uuid,p_actor uuid,p_decision text,p_reason text default null)
returns void language plpgsql security definer set search_path=catalog,public as $$
declare v_status text;
begin
  if p_actor is null then raise exception 'Human approver is required'; end if;
  v_status:=upper(coalesce(p_decision,''));
  if v_status not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED'; end if;
  update catalog.asset_promotion_requests set status=v_status,decided_by=p_actor,decided_at=now(),decision_reason=p_reason,updated_at=now() where id=p_request_id and status='REQUESTED';
  if not found then raise exception 'Promotion request is not awaiting a decision'; end if;
end $$;

create or replace function catalog.promote_approved_asset(p_request_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path=catalog,profiling,public as $$
declare v_req catalog.asset_promotion_requests%rowtype; v_asset catalog.discovered_assets%rowtype; v_source catalog.data_sources%rowtype; v_dataset catalog.datasets%rowtype; v_version_id uuid; v_source_identifier text; v_dataset_name text;
begin
  if p_actor is null then raise exception 'Human actor is required'; end if;
  select * into v_req from catalog.asset_promotion_requests where id=p_request_id for update;
  if not found or v_req.status<>'APPROVED' then raise exception 'Only an approved promotion request can create a governed dataset'; end if;
  select * into v_asset from catalog.discovered_assets where source_id=v_req.source_id and identity_key=v_req.identity_key and is_current order by last_seen_at desc limit 1;
  if not found then raise exception 'Current discovered asset not found'; end if;
  select * into v_source from catalog.data_sources where id=v_req.source_id;
  v_source_identifier:=coalesce(nullif(v_asset.metadata->>'native_qualified_name',''),v_asset.asset_key);
  select * into v_dataset from catalog.datasets where project_id=v_req.project_id and data_source_id=v_req.source_id and lower(coalesce(source_identifier,''))=lower(v_source_identifier) order by updated_at desc limit 1;
  if not found then
    v_dataset_name:=coalesce(nullif(v_asset.namespace,'' )||'.','')||v_asset.name;
    if exists(select 1 from catalog.datasets where project_id=v_req.project_id and name=v_dataset_name) then v_dataset_name:=v_dataset_name||' ['||left(v_req.source_id::text,8)||']'; end if;
    insert into catalog.datasets(project_id,data_source_id,name,source_identifier,owner_user_id,business_domain,metadata)
    values(v_req.project_id,v_req.source_id,v_dataset_name,v_source_identifier,p_actor,nullif(v_req.recommendations->>'business_domain',''),jsonb_build_object('promotion_request_id',v_req.id,'discovered_asset_id',v_asset.id,'identity_key',v_req.identity_key,'promotion_human_approved',true)) returning * into v_dataset;
    insert into catalog.dataset_versions(dataset_id,version_number,source_uri,content_hash,schema_hash,column_count,observed_at,status,metadata)
    values(v_dataset.id,1,v_source_identifier,v_asset.structure_hash,v_asset.structure_hash,jsonb_array_length(v_asset.columns),v_asset.last_seen_at,'AVAILABLE',jsonb_build_object('discovered_asset_id',v_asset.id,'identity_key',v_req.identity_key,'source_asset_version',v_asset.version_number)) returning id into v_version_id;
    insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
    values(v_version_id,v_source.source_type,v_source_identifier,jsonb_build_object('source_id',v_source.id,'source_type',v_source.source_type,'connection_metadata',v_source.connection_metadata),true);
  end if;
  update catalog.asset_promotion_requests set status='PROMOTED',dataset_id=v_dataset.id,updated_at=now() where id=v_req.id;
  return v_dataset.id;
end $$;

revoke all on function catalog.recommend_asset_promotion(uuid,text,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function catalog.request_asset_promotion(uuid,uuid) from public,anon,authenticated;
revoke all on function catalog.decide_asset_promotion(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function catalog.promote_approved_asset(uuid,uuid) from public,anon,authenticated;
grant execute on function catalog.recommend_asset_promotion(uuid,text,numeric,text,jsonb) to service_role;
grant execute on function catalog.request_asset_promotion(uuid,uuid) to service_role;
grant execute on function catalog.decide_asset_promotion(uuid,uuid,text,text) to service_role;
grant execute on function catalog.promote_approved_asset(uuid,uuid) to service_role;
