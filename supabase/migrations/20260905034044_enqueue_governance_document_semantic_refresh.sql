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
  update governance.knowledge_documents
  set review_status=v_decision,
      reviewed_by=p_reviewer,
      reviewed_at=pg_catalog.now(),
      review_note=nullif(btrim(coalesce(p_comment,'')),''),
      status=case when v_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end,
      metadata=coalesce(metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object('enterprise_review',pg_catalog.jsonb_build_object('decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',pg_catalog.now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),
      updated_at=pg_catalog.now()
  where id=p_document_id and project_id=p_project_id
  returning * into v_document;
  perform pg_catalog.set_config('governance.knowledge_document_review_context','false',true);
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values (p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_DOCUMENT_REVIEWED','GOVERNANCE_KNOWLEDGE_DOCUMENT',p_document_id,pg_catalog.jsonb_build_object('decision',v_decision,'previous_review_status',v_previous,'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true));
  return pg_catalog.jsonb_build_object('id',v_document.id,'project_id',v_document.project_id,'document_key',v_document.document_key,'previous_review_status',v_previous,'review_status',v_document.review_status,'status',v_document.status,'reviewed_by',v_document.reviewed_by,'reviewed_at',v_document.reviewed_at,'review_note',v_document.review_note,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.enqueue_knowledge_document_semantic_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_id uuid;
  v_document_id uuid;
  v_review_status text;
  v_document_status text;
  v_trigger text;
  v_event_key text;
  v_idempotency_key text;
begin
  if tg_op='DELETE' then
    if old.status <> 'ACTIVE' then return old; end if;
    v_project_id := old.project_id;
    v_document_id := old.id;
    v_review_status := old.review_status;
    v_document_status := 'DELETED';
    v_trigger := 'KNOWLEDGE_DOCUMENT_DELETED';
    v_event_key := coalesce(old.updated_at::text, pg_catalog.clock_timestamp()::text);
  else
    if not (new.review_status is distinct from old.review_status or new.status is distinct from old.status) then return new; end if;
    v_project_id := new.project_id;
    v_document_id := new.id;
    v_review_status := new.review_status;
    v_document_status := new.status;
    v_trigger := case
      when new.review_status='APPROVED' and new.status='ACTIVE' then 'KNOWLEDGE_DOCUMENT_APPROVED'
      when new.review_status='REJECTED' then 'KNOWLEDGE_DOCUMENT_REJECTED'
      when old.review_status='APPROVED' and new.review_status='PENDING' then 'KNOWLEDGE_DOCUMENT_APPROVAL_RESET'
      else 'KNOWLEDGE_DOCUMENT_STATE_CHANGED'
    end;
    v_event_key := coalesce(new.reviewed_at::text, new.updated_at::text, pg_catalog.clock_timestamp()::text);
  end if;
  v_idempotency_key := 'semantic-index:v4:knowledge-document:' || v_document_id::text || ':' || lower(v_trigger) || ':' || v_event_key;
  insert into orchestration.job_queue(project_id,job_type,entity_id,idempotency_key,payload,priority,max_attempts,available_at)
  values (
    v_project_id,'SEMANTIC_INDEX',v_project_id,v_idempotency_key,
    pg_catalog.jsonb_build_object('projectId',v_project_id::text,'trigger',v_trigger,'documentId',v_document_id::text,'reviewStatus',v_review_status,'documentStatus',v_document_status,'version','v4'),
    140,3,pg_catalog.now()
  ) on conflict (project_id,idempotency_key) where idempotency_key is not null do nothing;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

revoke execute on function governance.enqueue_knowledge_document_semantic_refresh() from public, anon, authenticated, service_role;
drop trigger if exists trg_enqueue_knowledge_document_semantic_refresh on governance.knowledge_documents;
create trigger trg_enqueue_knowledge_document_semantic_refresh
after update or delete on governance.knowledge_documents
for each row execute function governance.enqueue_knowledge_document_semantic_refresh();
