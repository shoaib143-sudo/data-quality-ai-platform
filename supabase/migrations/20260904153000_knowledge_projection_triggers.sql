create or replace function orchestration.project_catalog_data_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row catalog.data_sources%rowtype;
  v_org uuid;
  v_operation text;
  v_event_type text;
  v_actor_id text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org from app.projects where id = v_row.project_id;
  if v_org is null then raise exception 'Cannot project data source % because project % is missing', v_row.id, v_row.project_id; end if;

  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'CATALOG.DATA_SOURCE_CREATED' when tg_op = 'DELETE' then 'CATALOG.DATA_SOURCE_DELETED' else 'CATALOG.DATA_SOURCE_UPDATED' end;
  v_actor_id := auth.uid()::text;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at, new.created_at, now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument', jsonb_build_object('objectType','DATA_SOURCE','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'sourceType', v_row.source_type,
      'status', v_row.status,
      'knowledgeDocument', jsonb_build_object(
        'objectType','DATA_SOURCE','objectId',v_row.id::text,'label',v_row.name,
        'description',null,
        'content',concat_ws(' ', v_row.name, v_row.source_type, v_row.status),
        'href','/sources/' || v_row.id::text,
        'metadata',jsonb_build_object('sourceType',v_row.source_type,'status',v_row.status),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org,1,v_operation,v_event_type,v_occurred_at,'DATA_SOURCE',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_catalog_data_source_change() from public, anon, authenticated;
drop trigger if exists data_sources_projection_outbox on catalog.data_sources;
create trigger data_sources_projection_outbox
after insert or delete or update of name, source_type, status, connection_metadata on catalog.data_sources
for each row execute function orchestration.project_catalog_data_source_change();

create or replace function orchestration.project_governance_glossary_term_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.glossary_terms%rowtype;
  v_org uuid;
  v_operation text;
  v_event_type text;
  v_actor_id text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org from app.projects where id = v_row.project_id;
  if v_org is null then raise exception 'Cannot project glossary term % because project % is missing', v_row.id, v_row.project_id; end if;

  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.GLOSSARY_TERM_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.GLOSSARY_TERM_DELETED' else 'GOVERNANCE.GLOSSARY_TERM_UPDATED' end;
  v_actor_id := auth.uid()::text;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at, new.created_at, now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument', jsonb_build_object('objectType','GLOSSARY_TERM','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'status',v_row.status,'domain',v_row.domain,
      'knowledgeDocument', jsonb_build_object(
        'objectType','GLOSSARY_TERM','objectId',v_row.id::text,'label',v_row.term,
        'description',v_row.definition,
        'content',concat_ws(' ',v_row.term,v_row.definition,v_row.domain,array_to_string(v_row.synonyms,' ')),
        'href','/glossary/' || v_row.id::text,
        'metadata',jsonb_build_object('domain',v_row.domain,'status',v_row.status,'synonyms',to_jsonb(v_row.synonyms)),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org,1,v_operation,v_event_type,v_occurred_at,'GLOSSARY_TERM',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_governance_glossary_term_change() from public, anon, authenticated;
drop trigger if exists glossary_terms_projection_outbox on governance.glossary_terms;
create trigger glossary_terms_projection_outbox
after insert or delete or update of term, definition, domain, synonyms, status, metadata on governance.glossary_terms
for each row execute function orchestration.project_governance_glossary_term_change();

create or replace function orchestration.project_governance_data_contract_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.data_contracts%rowtype;
  v_org uuid;
  v_operation text;
  v_event_type text;
  v_actor_id text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select organization_id into v_org from app.projects where id = v_row.project_id;
  if v_org is null then raise exception 'Cannot project data contract % because project % is missing', v_row.id, v_row.project_id; end if;

  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.DATA_CONTRACT_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.DATA_CONTRACT_DELETED' else 'GOVERNANCE.DATA_CONTRACT_UPDATED' end;
  v_actor_id := auth.uid()::text;
  v_occurred_at := case when tg_op = 'DELETE' then now() else coalesce(new.updated_at, new.created_at, now()) end;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument', jsonb_build_object('objectType','DATA_CONTRACT','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'datasetId',v_row.dataset_id,'status',v_row.status,'currentVersion',v_row.current_version,
      'knowledgeDocument', jsonb_build_object(
        'objectType','DATA_CONTRACT','objectId',v_row.id::text,'label',v_row.name,
        'description',null,
        'content',concat_ws(' ',v_row.name,v_row.status,'version',v_row.current_version::text),
        'href','/contracts/' || v_row.id::text,
        'metadata',jsonb_build_object('datasetId',v_row.dataset_id,'status',v_row.status,'currentVersion',v_row.current_version),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,aggregate_version,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org,1,v_operation,v_event_type,v_occurred_at,'DATA_CONTRACT',v_row.id::text,v_row.current_version::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_governance_data_contract_change() from public, anon, authenticated;
drop trigger if exists data_contracts_projection_outbox on governance.data_contracts;
create trigger data_contracts_projection_outbox
after insert or delete or update of name, status, current_version, dataset_id on governance.data_contracts
for each row execute function orchestration.project_governance_data_contract_change();

create or replace function orchestration.project_governance_classification_label_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.classification_labels%rowtype;
  v_org uuid;
  v_operation text;
  v_event_type text;
  v_actor_id text;
  v_occurred_at timestamptz := now();
  v_payload jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.project_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select organization_id into v_org from app.projects where id = v_row.project_id;
  if v_org is null then raise exception 'Cannot project classification label % because project % is missing', v_row.id, v_row.project_id; end if;

  v_operation := case when tg_op = 'DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op = 'INSERT' then 'GOVERNANCE.CLASSIFICATION_CREATED' when tg_op = 'DELETE' then 'GOVERNANCE.CLASSIFICATION_DELETED' else 'GOVERNANCE.CLASSIFICATION_UPDATED' end;
  v_actor_id := auth.uid()::text;

  if tg_op = 'DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument', jsonb_build_object('objectType','CLASSIFICATION','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'code',v_row.code,'category',v_row.category,'enabled',v_row.enabled,
      'knowledgeDocument', jsonb_build_object(
        'objectType','CLASSIFICATION','objectId',v_row.id::text,'label',v_row.name,
        'description',v_row.description,
        'content',concat_ws(' ',v_row.code,v_row.name,v_row.category,v_row.description),
        'href','/classification',
        'metadata',jsonb_build_object('code',v_row.code,'category',v_row.category,'enabled',v_row.enabled),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org,1,v_operation,v_event_type,v_occurred_at,'CLASSIFICATION',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_governance_classification_label_change() from public, anon, authenticated;
drop trigger if exists classification_labels_projection_outbox on governance.classification_labels;
create trigger classification_labels_projection_outbox
after insert or delete or update of code, name, category, description, handling_requirements, enabled on governance.classification_labels
for each row execute function orchestration.project_governance_classification_label_change();
