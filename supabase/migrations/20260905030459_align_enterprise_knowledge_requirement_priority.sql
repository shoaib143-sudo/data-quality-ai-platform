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
  v_priority text;
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
    v_priority := upper(btrim(coalesce(v_requirement->>'priority','MEDIUM')));
    if v_priority not in ('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'Requirement priority must be LOW, MEDIUM, HIGH or CRITICAL'; end if;
    insert into governance.knowledge_requirements(project_id,document_id,requirement_key,title,requirement_text,obligation_type,priority,metadata,updated_at)
    values (p_project_id,v_document.id,btrim(coalesce(v_requirement->>'requirementKey',v_requirement->>'requirement_key')),btrim(v_requirement->>'title'),btrim(coalesce(v_requirement->>'requirementText',v_requirement->>'requirement_text')),nullif(upper(btrim(coalesce(v_requirement->>'obligationType',v_requirement->>'obligation_type',''))),''),v_priority,(coalesce(v_requirement->'metadata','{}'::jsonb)-'synthetic')||jsonb_build_object('requirement_source','SUPPLIED','ingested_with_document',true),now());
    v_requirement_count := v_requirement_count + 1;
  end loop;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_actor,'USER','GOVERNANCE_KNOWLEDGE_DOCUMENT_INGESTED','GOVERNANCE_KNOWLEDGE_DOCUMENT',v_document.id,jsonb_build_object('document_key',v_document.document_key,'document_type',v_document.document_type,'source_kind',v_document.source_kind,'source_url',v_document.source_url,'review_status',v_document.review_status,'requirement_count',v_requirement_count,'database_capability_verified',true,'atomic_with_document',true));

  return jsonb_build_object('id',v_document.id,'project_id',v_document.project_id,'document_key',v_document.document_key,'status',v_document.status,'review_status',v_document.review_status,'content_hash',v_document.content_hash,'requirement_count',v_requirement_count,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

revoke execute on function governance.ingest_governance_knowledge_document(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function governance.ingest_governance_knowledge_document(uuid,uuid,jsonb,jsonb) to service_role;
