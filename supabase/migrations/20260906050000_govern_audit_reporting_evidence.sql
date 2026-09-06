-- Module 11: bind governance reports to immutable audit-chain evidence rather than mutable dashboards.

create table if not exists governance.audit_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  report_type text not null default 'GOVERNANCE_EVIDENCE',
  generated_by uuid,
  actor_ref text,
  actor_type text not null default 'SYSTEM',
  chain_sequence bigint not null,
  chain_tip_event_id uuid not null references governance.audit_events(id) on delete restrict,
  chain_tip_event_hash text not null,
  audit_event_count bigint not null,
  report_payload jsonb not null,
  report_hash text not null,
  created_at timestamptz not null default now(),
  check(actor_type in ('SYSTEM','USER')),
  check(report_type in ('GOVERNANCE_EVIDENCE','AUDIT_CHAIN','READINESS_EVIDENCE')),
  check(audit_event_count >= 1)
);
create index if not exists audit_report_snapshots_project_idx
  on governance.audit_report_snapshots(project_id,created_at desc,id);
create unique index if not exists audit_report_snapshots_hash_unique
  on governance.audit_report_snapshots(project_id,report_hash);

alter table governance.audit_report_snapshots enable row level security;
drop policy if exists audit_report_snapshots_read on governance.audit_report_snapshots;
create policy audit_report_snapshots_read on governance.audit_report_snapshots
  for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.audit_report_snapshots from public,anon,authenticated,service_role;
grant select on governance.audit_report_snapshots to authenticated,service_role;
grant insert on governance.audit_report_snapshots to service_role;

create or replace function governance.audit_report_evidence_guard()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  raise exception 'Audit report evidence is append-only';
end;
$$;
revoke all on function governance.audit_report_evidence_guard() from public,anon,authenticated,service_role;
drop trigger if exists audit_report_snapshots_immutable on governance.audit_report_snapshots;
create trigger audit_report_snapshots_immutable
before update or delete on governance.audit_report_snapshots
for each row execute function governance.audit_report_evidence_guard();

create or replace function governance.compute_audit_report_hash(
  p_report_id uuid,
  p_project_id uuid,
  p_report_type text,
  p_actor_ref text,
  p_actor_type text,
  p_chain_sequence bigint,
  p_chain_tip_event_id uuid,
  p_chain_tip_event_hash text,
  p_audit_event_count bigint,
  p_report_payload jsonb
)
returns text language sql immutable
set search_path='pg_catalog','extensions' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'id',p_report_id,
    'project_id',p_project_id,
    'report_type',p_report_type,
    'actor_ref',p_actor_ref,
    'actor_type',p_actor_type,
    'chain_sequence',p_chain_sequence,
    'chain_tip_event_id',p_chain_tip_event_id,
    'chain_tip_event_hash',p_chain_tip_event_hash,
    'audit_event_count',p_audit_event_count,
    'report_payload',p_report_payload
  )::text,'UTF8'),'sha256'),'hex');
$$;
revoke all on function governance.compute_audit_report_hash(uuid,uuid,text,text,text,bigint,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function governance.compute_audit_report_hash(uuid,uuid,text,text,text,bigint,uuid,text,bigint,jsonb) to service_role;

create or replace function governance.generate_audit_report_snapshot(
  p_project_id uuid,
  p_actor uuid default null,
  p_report_type text default 'GOVERNANCE_EVIDENCE'
)
returns uuid language plpgsql security definer
set search_path='pg_catalog','governance','app','extensions' as $$
declare
  v_report_id uuid:=gen_random_uuid();
  v_actor_type text:=case when p_actor is null then 'SYSTEM' else 'USER' end;
  v_actor_ref text:=p_actor::text;
  v_tip governance.audit_events%rowtype;
  v_count bigint;
  v_chain jsonb;
  v_audit_posture jsonb;
  v_security_posture jsonb;
  v_quality_control jsonb;
  v_workflow_contract jsonb;
  v_payload jsonb;
  v_hash text;
  v_report_type text:=upper(btrim(coalesce(p_report_type,'')));
begin
  if not exists(select 1 from app.projects where id=p_project_id) then
    raise exception 'Project not found';
  end if;
  if v_report_type not in ('GOVERNANCE_EVIDENCE','AUDIT_CHAIN','READINESS_EVIDENCE') then
    raise exception 'Unsupported audit report type';
  end if;
  if p_actor is not null and not exists(
    select 1 from app.projects p
    join app.organization_members m on m.organization_id=p.organization_id
    where p.id=p_project_id and m.user_id=p_actor
  ) then raise exception 'Audit report actor is not a project member'; end if;

  -- The report-generation event becomes the exact chain tip to which this report is bound.
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,v_actor_type,'GOVERNANCE_AUDIT_REPORT_GENERATED','AUDIT_REPORT_SNAPSHOT',v_report_id,
    jsonb_build_object('report_type',v_report_type,'evidence_snapshot',true));

  select * into v_tip from governance.audit_events
  where project_id=p_project_id and entity_type='AUDIT_REPORT_SNAPSHOT' and entity_id=v_report_id
  order by chain_sequence desc nulls last,created_at desc limit 1;
  if not found or v_tip.event_hash is null or v_tip.chain_sequence is null then
    raise exception 'Audit report chain anchor was not created';
  end if;

  select count(*) into v_count from governance.audit_events where project_id=p_project_id;
  v_chain:=governance.verify_audit_chain(p_project_id);
  v_audit_posture:=governance.verify_governance_audit_posture();
  v_security_posture:=governance.verify_database_api_security_posture();
  v_quality_control:=governance.verify_quality_control_posture();
  v_workflow_contract:=governance.verify_workflow_contract_posture();

  v_payload:=jsonb_build_object(
    'project_id',p_project_id,
    'report_type',v_report_type,
    'audit_chain',v_chain,
    'audit_posture',v_audit_posture,
    'database_api_security_posture',v_security_posture,
    'quality_control_posture',v_quality_control,
    'workflow_contract_posture',v_workflow_contract,
    'chain_anchor',jsonb_build_object('event_id',v_tip.id,'event_hash',v_tip.event_hash,'chain_sequence',v_tip.chain_sequence),
    'audit_event_count',v_count,
    'truth_boundaries',jsonb_build_object(
      'real_field_lineage_data_not_ingested',true,
      'real_governance_corpus_not_ingested',true,
      'synthetic_governance_authority_claimed',false
    )
  );
  v_hash:=governance.compute_audit_report_hash(v_report_id,p_project_id,v_report_type,v_actor_ref,v_actor_type,v_tip.chain_sequence,v_tip.id,v_tip.event_hash,v_count,v_payload);

  insert into governance.audit_report_snapshots(
    id,project_id,report_type,generated_by,actor_ref,actor_type,chain_sequence,chain_tip_event_id,chain_tip_event_hash,audit_event_count,report_payload,report_hash
  ) values(
    v_report_id,p_project_id,v_report_type,p_actor,v_actor_ref,v_actor_type,v_tip.chain_sequence,v_tip.id,v_tip.event_hash,v_count,v_payload,v_hash
  );
  return v_report_id;
end;
$$;
revoke all on function governance.generate_audit_report_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function governance.generate_audit_report_snapshot(uuid,uuid,text) to service_role;

create or replace function governance.verify_audit_reporting_posture()
returns jsonb language sql stable security definer
set search_path='pg_catalog','governance' as $$
with integrity as (
  select count(*) filter(where report_hash is distinct from governance.compute_audit_report_hash(
      id,project_id,report_type,actor_ref,actor_type,chain_sequence,chain_tip_event_id,chain_tip_event_hash,audit_event_count,report_payload
    )) as invalid_hashes,
    count(*) filter(where not exists(
      select 1 from governance.audit_events e
      where e.id=s.chain_tip_event_id and e.project_id=s.project_id and e.event_hash=s.chain_tip_event_hash and e.chain_sequence=s.chain_sequence
    )) as invalid_anchors,
    count(*) as report_count
  from governance.audit_report_snapshots s
), trig as (
  select exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='governance' and c.relname='audit_report_snapshots' and t.tgname='audit_report_snapshots_immutable' and not t.tgisinternal and t.tgenabled<>'D'
  ) as immutable_trigger
), grants as (
  select
    has_table_privilege('anon','governance.audit_report_snapshots','INSERT')
      or has_table_privilege('anon','governance.audit_report_snapshots','UPDATE')
      or has_table_privilege('anon','governance.audit_report_snapshots','DELETE') as anon_write,
    has_table_privilege('authenticated','governance.audit_report_snapshots','INSERT')
      or has_table_privilege('authenticated','governance.audit_report_snapshots','UPDATE')
      or has_table_privilege('authenticated','governance.audit_report_snapshots','DELETE') as authenticated_write
)
select jsonb_build_object(
  'valid',i.invalid_hashes=0 and i.invalid_anchors=0 and t.immutable_trigger and not g.anon_write and not g.authenticated_write,
  'report_count',i.report_count,
  'invalid_report_hashes',i.invalid_hashes,
  'invalid_chain_anchors',i.invalid_anchors,
  'append_only_trigger',t.immutable_trigger,
  'anonymous_write_access',g.anon_write,
  'authenticated_write_access',g.authenticated_write
) from integrity i cross join trig t cross join grants g;
$$;
revoke all on function governance.verify_audit_reporting_posture() from public,anon,authenticated;
grant execute on function governance.verify_audit_reporting_posture() to service_role;
