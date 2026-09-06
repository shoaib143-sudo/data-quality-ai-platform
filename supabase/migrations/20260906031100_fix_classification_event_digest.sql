create or replace function governance.capture_classification_event()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','governance','extensions'
as $$
declare
  v_type text;
  v_actor uuid;
  v_payload jsonb;
begin
  v_type:=case when tg_op='INSERT' then 'PROPOSED'
    when new.status is distinct from old.status then 'REVIEW_DECIDED'
    when new.target_state is distinct from old.target_state then 'TARGET_STATE_CHANGED'
    else 'STATE_REFRESHED' end;
  v_actor:=coalesce(new.reviewed_by,new.approved_by);
  v_payload:=jsonb_build_object('target_type',new.target_type,'dataset_id',new.dataset_id,'data_source_id',new.data_source_id,
    'catalog_identity_key',new.catalog_identity_key,'target_locator',new.target_locator,'column_name',new.column_name,
    'label_id',new.label_id,'origin',new.origin,'source',new.source,'confidence',new.confidence,
    'status',new.status,'authority_state',new.authority_state,'target_state',new.target_state,
    'catalog_revision_id',new.catalog_revision_id,'evidence',new.evidence);
  insert into governance.classification_events(project_id,classification_id,event_type,actor_user_id,status,authority_state,target_state,evidence,event_hash)
  values(new.project_id,new.id,v_type,v_actor,new.status,new.authority_state,new.target_state,v_payload,
    encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex'));
  return new;
end;
$$;
revoke all on function governance.capture_classification_event() from public,anon,authenticated,service_role;
