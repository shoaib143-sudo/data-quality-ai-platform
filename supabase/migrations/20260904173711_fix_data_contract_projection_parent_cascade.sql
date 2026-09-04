create or replace function orchestration.project_governance_data_contract_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
  if v_org is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'Cannot project data contract % because project % is missing', v_row.id, v_row.project_id;
  end if;

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
$function$;
