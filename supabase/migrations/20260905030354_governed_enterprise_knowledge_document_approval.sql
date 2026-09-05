alter table governance.knowledge_documents
  add column if not exists review_status text not null default 'NOT_REQUIRED',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table governance.knowledge_documents
  drop constraint if exists knowledge_documents_review_status_check;
alter table governance.knowledge_documents
  add constraint knowledge_documents_review_status_check
  check (review_status in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'));

update governance.knowledge_documents
set review_status = case
      when source_kind='SYNTHETIC' or coalesce(metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb then 'NOT_REQUIRED'
      else 'PENDING'
    end,
    status = case
      when source_kind='SYNTHETIC' or coalesce(metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb then status
      else 'DRAFT'
    end,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    updated_at = now();

create or replace function governance.protect_knowledge_document_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_review_context boolean := coalesce(pg_catalog.current_setting('governance.knowledge_document_review_context', true),'')='true';
  v_old_bootstrap boolean := false;
  v_new_bootstrap boolean := false;
  v_material_change boolean := false;
begin
  if tg_op='INSERT' then
    if new.source_kind='SYNTHETIC' then
      new.review_status := 'NOT_REQUIRED';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
      return new;
    end if;
    if nullif(btrim(coalesce(new.source_url,'')),'') is null then
      raise exception 'Non-synthetic governance knowledge requires source provenance in source_url';
    end if;
    if not v_review_context then
      new.review_status := 'PENDING';
      new.status := 'DRAFT';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    return new;
  end if;

  v_old_bootstrap := old.source_kind='SYNTHETIC'
    or coalesce(old.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb;
  v_new_bootstrap := new.source_kind='SYNTHETIC'
    or (v_old_bootstrap and coalesce(new.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb);

  if new.source_kind<>'SYNTHETIC' and nullif(btrim(coalesce(new.source_url,'')),'') is null then
    raise exception 'Non-synthetic governance knowledge requires source provenance in source_url';
  end if;
  if v_review_context then return new; end if;
  if new.review_status is distinct from old.review_status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note then
    raise exception 'Governance knowledge review state may only be changed through the governed review RPC';
  end if;
  if old.source_kind<>'SYNTHETIC' and not v_old_bootstrap and new.source_kind='SYNTHETIC' then
    raise exception 'A governed enterprise knowledge document cannot be converted to SYNTHETIC';
  end if;

  v_material_change :=
    new.document_type is distinct from old.document_type
    or new.title is distinct from old.title
    or new.summary is distinct from old.summary
    or new.content is distinct from old.content
    or new.domain is distinct from old.domain
    or new.jurisdiction is distinct from old.jurisdiction
    or new.effective_at is distinct from old.effective_at
    or new.expires_at is distinct from old.expires_at
    or new.source_kind is distinct from old.source_kind
    or new.source_url is distinct from old.source_url
    or new.content_hash is distinct from old.content_hash
    or new.metadata is distinct from old.metadata;

  if v_old_bootstrap and not v_new_bootstrap then
    new.review_status := 'PENDING';
    new.status := 'DRAFT';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  elsif old.review_status='APPROVED' and v_material_change then
    new.review_status := 'PENDING';
    new.status := 'DRAFT';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  elsif old.review_status in ('PENDING','REJECTED') and new.status='ACTIVE' then
    raise exception 'Pending or rejected enterprise governance knowledge cannot be activated without governed approval';
  end if;
  return new;
end;
$function$;

revoke execute on function governance.protect_knowledge_document_review() from public, anon, authenticated;
drop trigger if exists trg_protect_knowledge_document_review on governance.knowledge_documents;
create trigger trg_protect_knowledge_document_review
before insert or update on governance.knowledge_documents
for each row execute function governance.protect_knowledge_document_review();
create index if not exists idx_knowledge_documents_review_state
  on governance.knowledge_documents(project_id,status,review_status,source_kind);

create or replace function governance.ingest_governance_knowledge_document(
  p_project_id uuid,p_actor uuid,p_document jsonb,p_requirements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_document governance.knowledge_documents%rowtype;
  v_existing governance.knowledge_documents%rowtype;
  v_document_key text := btrim(coalesce(p_document->>'documentKey',p_document->>'document_key',''));
  v_document_type text := upper(btrim(coalesce(p_document->>'documentType',p_document->>'document_type','')));
  v_title text := btrim(coalesce(p_document->>'title',''));
  v_content text := coalesce(p_document->>'content','');
  v_source_kind text := upper(btrim(coalesce(p_document->>'sourceKind',p_document->>'source_kind','')));
  v_source_url text := btrim(coalesce(p_document->>'sourceUrl',p_document->>'source_url',''));
  v_metadata jsonb := coalesce(p_document->'metadata','{}'::jsonb);
  v_requirement jsonb;
  v_requirement_count integer := 0;
  v_content_hash text;
begin
  if p_actor is null then raise exception 'Governance knowledge ingestion requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'catalog.update') then raise exception 'Actor is not authorized for catalog.update in this project'; end if;
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if jsonb_typeof(coalesce(p_document,'{}'::jsonb))<>'object' then raise exception 'document must be a JSON object'; end if;
  if jsonb_typeof(coalesce(p_requirements,'[]'::jsonb))<>'array' then raise exception 'requirements must be a JSON array'; end if;
  if jsonb_typeof(v_metadata)<>'object' then raise exception 'document metadata must be a JSON object'; end if;
  if v_document_key='' or v_title='' or btrim(v_content)='' then raise exception 'documentKey, title and content are required'; end if;
  if v_document_type not in ('POLICY','STANDARD','REGULATION','GLOSSARY','CDE_REGISTRY','OWNERSHIP_STEWARDSHIP','DATA_CONTRACT','CERTIFICATION_RECORD','ISSUE_HISTORY','INCIDENT_HISTORY','REMEDIATION_HISTORY') then raise exception 'Unsupported governance document type %',v_document_type; end if;
  if v_source_kind not in ('INTERNAL','EXTERNAL_REFERENCE') then raise exception 'Enterprise governance intake requires sourceKind INTERNAL or EXTERNAL_REFERENCE'; end if;
  if v_source_url='' then raise exception 'Enterprise governance intake requires sourceUrl provenance'; end if;
  if char_length(v_document_key)>200 or char_length(v_title)>500 or char_length(v_source_url)>4000 then raise exception 'Governance document input exceeds supported field length'; end if;

  select * into v_existing from governance.knowledge_documents where project_id=p_project_id and document_key=v_document_key for update;
  if found and (v_existing.source_kind='SYNTHETIC' or coalesce(v_existing.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb) then raise exception 'Synthetic/bootstrap document keys cannot be overwritten by enterprise intake'; end if;

  v_metadata := (v_metadata - 'synthetic_bootstrap' - 'synthetic' - 'enterprise_approved') || jsonb_build_object('enterprise_intake',true,'ingested_by',p_actor,'ingested_at',now());
  v_content_hash := encode(extensions.digest(convert_to(v_content,'UTF8'),'sha256'),'hex');

  insert into governance.knowledge_documents(project_id,document_key,document_type,title,summary,content,domain,jurisdiction,effective_at,expires_at,source_kind,source_url,status,content_hash,metadata,updated_at)
  values (p_project_id,v_document_key,v_document_type,v_title,nullif(btrim(coalesce(p_document->>'summary','')),''),v_content,nullif(btrim(coalesce(p_document->>'domain','')),''),nullif(btrim(coalesce(p_document->>'jurisdiction','')),''),nullif(p_document->>'effectiveAt','')::timestamptz,nullif(p_document->>'expiresAt','')::timestamptz,v_source_kind,v_source_url,'DRAFT',v_content_hash,v_metadata,now())
  on conflict(project_id,document_key) do update set document_type=excluded.document_type,title=excluded.title,summary=excluded.summary,content=excluded.content,domain=excluded.domain,jurisdiction=excluded.jurisdiction,effective_at=excluded.effective_at,expires_at=excluded.expires_at,source_kind=excluded.source_kind,source_url=excluded.source_url,status='DRAFT',content_hash=excluded.content_hash,metadata=excluded.metadata,updated_at=now()
  returning * into v_document;

  delete from governance.knowledge_requirements where document_id=v_document.id;
  for v_requirement in select value from jsonb_array_elements(p_requirements)
  loop
    if jsonb_typeof(v_requirement)<>'object' then raise exception 'Each requirement must be a JSON object'; end if;
    if btrim(coalesce(v_requirement->>'requirementKey',v_requirement->>'requirement_key',''))='' or btrim(coalesce(v_requirement->>'title',''))='' or btrim(coalesce(v_requirement->>'requirementText',v_requirement->>'requirement_text',''))='' then raise exception 'Each requirement requires requirementKey, title and requirementText'; end if;
    if jsonb_typeof(coalesce(v_requirement->'metadata','{}'::jsonb))<>'object' then raise exception 'Requirement metadata must be a JSON object'; end if;
    insert into governance.knowledge_requirements(project_id,document_id,requirement_key,title,requirement_text,obligation_type,priority,metadata,updated_at)
    values (p_project_id,v_document.id,btrim(coalesce(v_requirement->>'requirementKey',v_requirement->>'requirement_key')),btrim(v_requirement->>'title'),btrim(coalesce(v_requirement->>'requirementText',v_requirement->>'requirement_text')),nullif(upper(btrim(coalesce(v_requirement->>'obligationType',v_requirement->>'obligation_type',''))),''),coalesce(nullif(v_requirement->>'priority','')::integer,0),(coalesce(v_requirement->'metadata','{}'::jsonb)-'synthetic')||jsonb_build_object('requirement_source','SUPPLIED','ingested_with_document',true),now());
    v_requirement_count := v_requirement_count + 1;
  end loop;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_actor,'USER','GOVERNANCE_KNOWLEDGE_DOCUMENT_INGESTED','GOVERNANCE_KNOWLEDGE_DOCUMENT',v_document.id,jsonb_build_object('document_key',v_document.document_key,'document_type',v_document.document_type,'source_kind',v_document.source_kind,'source_url',v_document.source_url,'review_status',v_document.review_status,'requirement_count',v_requirement_count,'database_capability_verified',true,'atomic_with_document',true));

  return jsonb_build_object('id',v_document.id,'project_id',v_document.project_id,'document_key',v_document.document_key,'status',v_document.status,'review_status',v_document.review_status,'content_hash',v_document.content_hash,'requirement_count',v_requirement_count,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.review_governance_knowledge_document(p_project_id uuid,p_document_id uuid,p_reviewer uuid,p_decision text,p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_previous text;
  v_document governance.knowledge_documents%rowtype;
begin
  if p_reviewer is null then raise exception 'Governance knowledge review requires an accountable reviewer'; end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'policy.approve') then raise exception 'Reviewer is not authorized for policy.approve in this project'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED'; end if;
  if char_length(coalesce(p_comment,''))>2000 then raise exception 'Review comment must be 2000 characters or fewer'; end if;
  select * into v_document from governance.knowledge_documents where id=p_document_id and project_id=p_project_id for update;
  if not found then raise exception 'Governance knowledge document was not found in this project'; end if;
  if v_document.source_kind='SYNTHETIC' or coalesce(v_document.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb then raise exception 'Synthetic/bootstrap governance knowledge is not eligible for enterprise approval'; end if;
  if nullif(btrim(coalesce(v_document.source_url,'')),'') is null then raise exception 'Enterprise governance approval requires source provenance'; end if;
  if nullif(btrim(coalesce(v_document.content,'')),'') is null or nullif(btrim(coalesce(v_document.content_hash,'')),'') is null then raise exception 'Enterprise governance approval requires content and content hash evidence'; end if;
  v_previous := v_document.review_status;
  perform pg_catalog.set_config('governance.knowledge_document_review_context','true',true);
  update governance.knowledge_documents set review_status=v_decision,reviewed_by=p_reviewer,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_comment,'')),''),status=case when v_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('enterprise_review',jsonb_build_object('decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),updated_at=now()
  where id=p_document_id and project_id=p_project_id returning * into v_document;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_DOCUMENT_REVIEWED','GOVERNANCE_KNOWLEDGE_DOCUMENT',p_document_id,jsonb_build_object('decision',v_decision,'previous_review_status',v_previous,'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_document.id,'project_id',v_document.project_id,'document_key',v_document.document_key,'previous_review_status',v_previous,'review_status',v_document.review_status,'status',v_document.status,'reviewed_by',v_document.reviewed_by,'reviewed_at',v_document.reviewed_at,'review_note',v_document.review_note,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

revoke execute on function governance.ingest_governance_knowledge_document(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function governance.review_governance_knowledge_document(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function governance.ingest_governance_knowledge_document(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function governance.review_governance_knowledge_document(uuid,uuid,uuid,text,text) to service_role;
revoke insert, update, delete on governance.knowledge_documents from anon, authenticated;
revoke insert, update, delete on governance.knowledge_requirements from anon, authenticated;

create or replace function governance.search_governance_knowledge_lexical(p_project_id uuid,p_query text,p_limit integer default 25)
returns table(object_type text,object_key text,title text,content text,metadata jsonb,relevance numeric)
language sql stable set search_path = ''
as $function$
with q as (select nullif(trim(p_query),'') query), candidates(object_type,object_key,title,content,metadata,relevance) as (
 select 'KNOWLEDGE_DOCUMENT'::text,d.document_key,d.title,coalesce(d.summary,'')||E'\n'||d.content,jsonb_build_object('document_type',d.document_type,'domain',d.domain,'jurisdiction',d.jurisdiction,'source_url',d.source_url,'source_kind',d.source_kind,'review_status',d.review_status)||d.metadata,(case when lower(d.title)=lower(q.query) then 1.0 when d.title ilike '%'||q.query||'%' then 0.9 when d.content ilike '%'||q.query||'%' then 0.7 else 0.0 end)::numeric
 from governance.knowledge_documents d cross join q where d.project_id=p_project_id and d.status='ACTIVE' and q.query is not null and (d.source_kind='SYNTHETIC' or coalesce(d.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb or d.review_status='APPROVED') and (d.title ilike '%'||q.query||'%' or coalesce(d.summary,'') ilike '%'||q.query||'%' or d.content ilike '%'||q.query||'%')
 union all
 select 'KNOWLEDGE_REQUIREMENT',r.requirement_key,r.title,r.requirement_text,jsonb_build_object('obligation_type',r.obligation_type,'priority',r.priority,'document_id',r.document_id,'document_key',d.document_key,'document_review_status',d.review_status)||r.metadata,(case when lower(r.title)=lower(q.query) then 1.0 when r.title ilike '%'||q.query||'%' then 0.9 else 0.75 end)::numeric
 from governance.knowledge_requirements r join governance.knowledge_documents d on d.id=r.document_id cross join q where r.project_id=p_project_id and d.project_id=p_project_id and d.status='ACTIVE' and q.query is not null and (d.source_kind='SYNTHETIC' or coalesce(d.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb or d.review_status='APPROVED') and (r.title ilike '%'||q.query||'%' or r.requirement_text ilike '%'||q.query||'%')
 union all
 select 'GLOSSARY_TERM',g.id::text,g.term,g.definition,jsonb_build_object('domain',g.domain,'synonyms',g.synonyms,'status',g.status)||g.metadata,(case when lower(g.term)=lower(q.query) then 1.0 when g.term ilike '%'||q.query||'%' then 0.95 else 0.72 end)::numeric from governance.glossary_terms g cross join q where g.project_id=p_project_id and g.status<>'DEPRECATED' and q.query is not null and (g.term ilike '%'||q.query||'%' or g.definition ilike '%'||q.query||'%' or array_to_string(g.synonyms,' ') ilike '%'||q.query||'%')
 union all
 select 'CRITICAL_DATA_ELEMENT',c.cde_key,c.name,c.definition,jsonb_build_object('domain',c.domain,'criticality',c.criticality,'regulatory_relevance',c.regulatory_relevance,'owner_role',c.owner_role,'steward_role',c.steward_role)||c.metadata,(case when lower(c.name)=lower(q.query) then 1.0 when c.name ilike '%'||q.query||'%' then 0.95 else 0.74 end)::numeric from governance.critical_data_elements c cross join q where c.project_id=p_project_id and c.status='ACTIVE' and q.query is not null and (c.name ilike '%'||q.query||'%' or c.definition ilike '%'||q.query||'%' or c.cde_key ilike '%'||q.query||'%')
)
select object_type,object_key,title,content,metadata,relevance from candidates order by relevance desc,title limit greatest(1,least(coalesce(p_limit,25),100));
$function$;

DO $block$
declare v_definition text; v_old text := 'project_id=p_project_id and coalesce((metadata->>''synthetic_bootstrap'')::boolean,false)=false'; v_new text := 'project_id=p_project_id and source_kind<>''SYNTHETIC'' and status=''ACTIVE'' and review_status=''APPROVED'' and not (coalesce(metadata,''{}''::jsonb) @> ''{"synthetic_bootstrap":true}''::jsonb)';
begin
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='governance' and p.proname='verify_ai_governance_intelligence_active';
  if v_definition is null then raise exception 'verify_ai_governance_intelligence_active was not found'; end if;
  if strpos(v_definition,v_old)=0 then raise exception 'Enterprise corpus gate predicate changed; migration requires explicit review'; end if;
  execute replace(v_definition,v_old,v_new);
end;
$block$;
