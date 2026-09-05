create or replace function governance.upsert_manual_lineage_edge(
  p_project_id uuid,
  p_actor uuid,
  p_source_type text,
  p_source_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_relationship text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_type text := upper(btrim(coalesce(p_source_type,'')));
  v_target_type text := upper(btrim(coalesce(p_target_type,'')));
  v_relationship text := upper(btrim(coalesce(p_relationship,'')));
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
  v_source_valid boolean := false;
  v_target_valid boolean := false;
  v_edge governance.lineage_edges%rowtype;
begin
  if p_actor is null then raise exception 'Manual lineage mutation requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'lineage.manage') then
    raise exception 'Actor is not authorized for lineage.manage in this project';
  end if;
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if p_source_id is null or p_target_id is null then raise exception 'sourceId and targetId are required'; end if;
  if v_source_type not in ('DATA_SOURCE','DATASET','DATASET_VERSION','PROFILE_RUN','AGENT_RUN','EXTERNAL_ASSET') then
    raise exception 'Unsupported lineage source type %',v_source_type;
  end if;
  if v_target_type not in ('DATA_SOURCE','DATASET','DATASET_VERSION','PROFILE_RUN','AGENT_RUN','EXTERNAL_ASSET') then
    raise exception 'Unsupported lineage target type %',v_target_type;
  end if;
  if v_relationship='' or char_length(v_relationship)>100 then raise exception 'relationship is required and must be 100 characters or fewer'; end if;
  if jsonb_typeof(v_metadata)<>'object' then raise exception 'metadata must be a JSON object'; end if;

  v_source_valid := case v_source_type
    when 'DATA_SOURCE' then exists(select 1 from catalog.data_sources x where x.id=p_source_id and x.project_id=p_project_id)
    when 'DATASET' then exists(select 1 from catalog.datasets x where x.id=p_source_id and x.project_id=p_project_id)
    when 'DATASET_VERSION' then exists(select 1 from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id where dv.id=p_source_id and d.project_id=p_project_id)
    when 'PROFILE_RUN' then exists(select 1 from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where pr.id=p_source_id and d.project_id=p_project_id)
    when 'AGENT_RUN' then exists(select 1 from agent.agent_runs ar where ar.id=p_source_id and ar.project_id=p_project_id)
    when 'EXTERNAL_ASSET' then exists(select 1 from governance.lineage_assets la where la.id=p_source_id and la.project_id=p_project_id)
    else false end;
  v_target_valid := case v_target_type
    when 'DATA_SOURCE' then exists(select 1 from catalog.data_sources x where x.id=p_target_id and x.project_id=p_project_id)
    when 'DATASET' then exists(select 1 from catalog.datasets x where x.id=p_target_id and x.project_id=p_project_id)
    when 'DATASET_VERSION' then exists(select 1 from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id where dv.id=p_target_id and d.project_id=p_project_id)
    when 'PROFILE_RUN' then exists(select 1 from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where pr.id=p_target_id and d.project_id=p_project_id)
    when 'AGENT_RUN' then exists(select 1 from agent.agent_runs ar where ar.id=p_target_id and ar.project_id=p_project_id)
    when 'EXTERNAL_ASSET' then exists(select 1 from governance.lineage_assets la where la.id=p_target_id and la.project_id=p_project_id)
    else false end;
  if not v_source_valid then raise exception 'Source lineage node does not belong to this project'; end if;
  if not v_target_valid then raise exception 'Target lineage node does not belong to this project'; end if;

  v_metadata := (v_metadata - 'password' - 'secret' - 'token' - 'credential' - 'authorization' - 'api_key' - 'private_key')
    || jsonb_build_object('manual',true,'created_by',p_actor,'governed_write',true);

  insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
  values(p_project_id,v_source_type,p_source_id,v_target_type,p_target_id,v_relationship,v_metadata)
  on conflict(project_id,source_type,source_id,target_type,target_id,relationship)
  do update set metadata=excluded.metadata
  returning * into v_edge;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,'USER','LINEAGE_EDGE_MANUALLY_UPSERTED','LINEAGE_EDGE',v_edge.id,
    jsonb_build_object(
      'source_type',v_source_type,'source_id',p_source_id,
      'target_type',v_target_type,'target_id',p_target_id,
      'relationship',v_relationship,
      'atomic_with_edge',true,'database_capability_verified',true
    ));

  return to_jsonb(v_edge) || jsonb_build_object('audit_atomic',true,'database_capability_verified',true);
end;
$function$;

revoke all on function governance.upsert_manual_lineage_edge(uuid,uuid,text,uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function governance.upsert_manual_lineage_edge(uuid,uuid,text,uuid,text,uuid,text,jsonb) to service_role;

revoke insert, update, delete on governance.lineage_edges from anon, authenticated;
revoke insert, update, delete on governance.lineage_integrations from anon, authenticated;
