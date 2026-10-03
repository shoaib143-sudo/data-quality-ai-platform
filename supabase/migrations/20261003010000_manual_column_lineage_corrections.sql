begin;

create unique index if not exists lineage_column_mappings_manual_identity_idx
  on governance.lineage_column_mappings(
    project_id,
    transformation_id,
    source_asset_id,
    source_column,
    target_asset_id,
    target_column
  )
  where source_asset_id is not null
    and target_asset_id is not null
    and source_column is not null
    and target_column is not null;

create or replace function governance.upsert_manual_lineage_column_mapping(
  p_project_id uuid,
  p_actor uuid,
  p_workflow_instance_id uuid,
  p_source_asset_id uuid,
  p_source_column text,
  p_target_asset_id uuid,
  p_target_column text,
  p_operation text default 'TRANSFORM',
  p_expression text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source_column text:=btrim(coalesce(p_source_column,''));
  v_target_column text:=btrim(coalesce(p_target_column,''));
  v_operation text:=upper(btrim(coalesce(p_operation,'TRANSFORM')));
  v_expression text:=nullif(btrim(coalesce(p_expression,'')),'');
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
  v_transformation governance.lineage_transformations%rowtype;
  v_mapping governance.lineage_column_mappings%rowtype;
begin
  if p_actor is null then raise exception 'Manual column-lineage mutation requires an accountable actor'; end if;
  if p_workflow_instance_id is null then raise exception 'Approved workflow instance identity is required'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'lineage.manage') then
    raise exception 'Actor is not authorized for lineage.manage in this project';
  end if;
  if v_source_column='' or char_length(v_source_column)>512 then
    raise exception 'sourceColumn is required and must be 512 characters or fewer';
  end if;
  if v_target_column='' or char_length(v_target_column)>512 then
    raise exception 'targetColumn is required and must be 512 characters or fewer';
  end if;
  if char_length(v_operation)>100 then raise exception 'operation must be 100 characters or fewer'; end if;
  if v_expression is not null and char_length(v_expression)>20000 then raise exception 'expression exceeds 20000 characters'; end if;
  if jsonb_typeof(v_metadata)<>'object' then raise exception 'metadata must be a JSON object'; end if;
  if not exists(select 1 from governance.lineage_assets where id=p_source_asset_id and project_id=p_project_id) then
    raise exception 'Source lineage asset does not belong to this project';
  end if;
  if not exists(select 1 from governance.lineage_assets where id=p_target_asset_id and project_id=p_project_id) then
    raise exception 'Target lineage asset does not belong to this project';
  end if;

  v_metadata := (v_metadata - 'password' - 'secret' - 'token' - 'credential' - 'authorization' - 'api_key' - 'private_key')
    || jsonb_build_object('manual',true,'created_by',p_actor,'workflow_instance_id',p_workflow_instance_id,'authority','HUMAN_APPROVED_MANUAL');

  insert into governance.lineage_transformations(
    project_id,integration_id,external_id,source_system,name,operation,logic_language,transformation_logic,logic_hash,metadata,last_seen_at
  ) values(
    p_project_id,null,'manual-correction:'||p_workflow_instance_id::text,'DATANEXUS_MANUAL',
    'Approved manual column-lineage correction',v_operation,
    case when v_expression is null then null else 'EXPRESSION' end,
    v_expression,
    case when v_expression is null then null else encode(digest(v_expression,'sha256'),'hex') end,
    v_metadata,now()
  )
  on conflict(project_id,integration_id,external_id)
  do update set operation=excluded.operation,logic_language=excluded.logic_language,
    transformation_logic=excluded.transformation_logic,logic_hash=excluded.logic_hash,
    metadata=excluded.metadata,last_seen_at=excluded.last_seen_at
  returning * into v_transformation;

  insert into governance.lineage_column_mappings(
    project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata
  ) values(
    p_project_id,v_transformation.id,p_source_asset_id,v_source_column,p_target_asset_id,v_target_column,v_operation,v_expression,v_metadata
  )
  on conflict(project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column)
  where source_asset_id is not null and target_asset_id is not null and source_column is not null and target_column is not null
  do update set operation=excluded.operation,expression=excluded.expression,metadata=excluded.metadata
  returning * into v_mapping;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(
    p_project_id,p_actor,'USER','LINEAGE_COLUMN_MAPPING_MANUALLY_UPSERTED','LINEAGE_COLUMN_MAPPING',v_mapping.id,
    jsonb_build_object(
      'workflow_instance_id',p_workflow_instance_id,
      'source_asset_id',p_source_asset_id,'source_column',v_source_column,
      'target_asset_id',p_target_asset_id,'target_column',v_target_column,
      'operation',v_operation,'authority','HUMAN_APPROVED_MANUAL'
    )
  );

  return jsonb_build_object(
    'mapping_id',v_mapping.id,
    'transformation_id',v_transformation.id,
    'source_column',v_source_column,
    'target_column',v_target_column,
    'authority','HUMAN_APPROVED_MANUAL'
  );
end;
$$;

revoke all on function governance.upsert_manual_lineage_column_mapping(uuid,uuid,uuid,uuid,text,uuid,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function governance.upsert_manual_lineage_column_mapping(uuid,uuid,uuid,uuid,text,uuid,text,text,text,jsonb)
  to service_role;

select pg_notify('pgrst','reload schema');
commit;
