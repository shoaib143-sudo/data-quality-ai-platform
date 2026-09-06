-- Production agent portfolio uses architect_agent as the canonical enabled key.
create or replace function governance.generate_ai_lineage_suggestions(
  p_project_id uuid,p_actor uuid,p_source_id uuid default null,p_max_suggestions integer default 100
)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_definition_id uuid;
  v_run_id uuid;
  v_inserted integer := 0;
  v_limit integer := greatest(1,least(coalesce(p_max_suggestions,100),250));
  v_candidate record;
begin
  if p_actor is null then raise exception 'AI lineage suggestion generation requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'lineage.read') then
    raise exception 'Actor is not authorized for lineage.read in this project';
  end if;
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if p_source_id is not null and not exists(
    select 1 from catalog.data_sources ds where ds.id=p_source_id and ds.project_id=p_project_id and ds.status::text='ACTIVE'
  ) then raise exception 'Requested source is not an active source in this project'; end if;

  select d.id into v_definition_id
  from agent.agent_definitions d
  where d.agent_key='architect_agent' and d.enabled=true
  order by d.created_at desc,d.id desc limit 1;
  if v_definition_id is null then raise exception 'Enabled architect_agent definition is required'; end if;

  insert into agent.agent_runs(agent_definition_id,project_id,status,input,started_at)
  values(v_definition_id,p_project_id,'RUNNING'::agent.run_status,jsonb_build_object(
    'task','AI_LINEAGE_METADATA_INFERENCE','source_id',p_source_id,'max_suggestions',v_limit,
    'requested_by',p_actor,'inference_model','metadata-lineage-heuristics-v1',
    'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'
  ),now()) returning id into v_run_id;

  for v_candidate in
    with assets as (
      select a.id,a.source_id,a.asset_type,a.namespace,a.name,a.columns,a.asset_key
      from catalog.current_discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
      where ds.project_id=p_project_id and ds.status::text='ACTIVE'
        and (p_source_id is null or a.source_id=p_source_id)
        and upper(a.asset_type) in ('TABLE','VIEW') and jsonb_typeof(a.columns)='array'
    ), source_columns as (
      select a.*,lower(btrim(c.value->>'name')) source_column,
        regexp_replace(lower(btrim(c.value->>'name')),'(_id|_key)$','') entity_prefix,
        case when lower(btrim(c.value->>'name')) like '%\_id' escape '\' then 'ID_SUFFIX' else 'KEY_SUFFIX' end suffix_kind
      from assets a cross join lateral jsonb_array_elements(a.columns) c(value)
      where lower(btrim(c.value->>'name')) like '%\_id' escape '\'
         or lower(btrim(c.value->>'name')) like '%\_key' escape '\'
    ), target_assets as (
      select a.*,case
        when lower(a.name) like '%ies' then regexp_replace(lower(a.name),'ies$','y')
        when lower(a.name) like '%s' and lower(a.name) not like '%ss' then regexp_replace(lower(a.name),'s$','')
        else lower(a.name) end entity_name
      from assets a
    ), candidates as (
      select s.id source_asset_id,s.source_id,s.namespace source_namespace,s.name source_name,s.asset_key source_asset_key,
        s.source_column,s.suffix_kind,t.id target_asset_id,t.namespace target_namespace,t.name target_name,t.asset_key target_asset_key,
        tk.target_column,case
          when s.namespace=t.namespace and tk.target_column='id' then 0.96::numeric
          when tk.target_column='id' then 0.93::numeric
          when s.namespace=t.namespace then 0.90::numeric else 0.87::numeric end confidence
      from source_columns s
      join target_assets t on t.source_id=s.source_id and t.id<>s.id and t.entity_name=s.entity_prefix
      cross join lateral (
        select lower(btrim(tc.value->>'name')) target_column from jsonb_array_elements(t.columns) tc(value)
        where lower(btrim(tc.value->>'name')) in ('id',s.source_column)
        order by case when lower(btrim(tc.value->>'name'))='id' then 0 else 1 end limit 1
      ) tk
      where not exists(
        select 1 from governance.ai_governance_suggestions existing
        where existing.project_id=p_project_id and existing.suggestion_type='LINEAGE'
          and existing.suggestion->'source'->>'discovered_asset_id'=s.id::text
          and lower(existing.suggestion->'source'->>'column')=s.source_column
          and existing.suggestion->'target'->>'discovered_asset_id'=t.id::text
          and lower(existing.suggestion->'target'->>'column')=tk.target_column
      )
      order by confidence desc,s.namespace,s.name,s.source_column,t.namespace,t.name limit v_limit
    ) select * from candidates
  loop
    perform governance.record_ai_governance_suggestion(
      p_project_id,v_run_id,'LINEAGE','DISCOVERED_FIELD',v_candidate.source_asset_id,
      v_candidate.target_asset_id::text||':'||v_candidate.target_column,
      jsonb_build_object(
        'kind','FIELD_DEPENDENCY_CANDIDATE','origin','AI_INFERRED_METADATA','relationship','REFERENTIAL_DEPENDENCY',
        'direction','SOURCE_DEPENDS_ON_TARGET','authority','SUGGESTION_ONLY',
        'source',jsonb_build_object('discovered_asset_id',v_candidate.source_asset_id,'catalog_identity_key',v_candidate.source_asset_key,
          'namespace',v_candidate.source_namespace,'asset',v_candidate.source_name,'column',v_candidate.source_column),
        'target',jsonb_build_object('discovered_asset_id',v_candidate.target_asset_id,'catalog_identity_key',v_candidate.target_asset_key,
          'namespace',v_candidate.target_namespace,'asset',v_candidate.target_name,'column',v_candidate.target_column)
      ),
      jsonb_build_object(
        'metadata_only',true,'observed_lineage',false,'source_authoritative_lineage',false,
        'inference_model','metadata-lineage-heuristics-v1','signals',jsonb_build_array(
          'SOURCE_COLUMN_'||v_candidate.suffix_kind,'TARGET_ENTITY_NAME_MATCH','TARGET_KEY_PRESENT',
          case when v_candidate.source_namespace=v_candidate.target_namespace then 'SAME_NAMESPACE' else 'CROSS_NAMESPACE' end),
        'truth_boundary','Candidate dependency inferred from catalog metadata. It is not source-observed transformation or field lineage.'
      ),v_candidate.confidence,null,null
    );
    v_inserted:=v_inserted+1;
  end loop;

  update agent.agent_runs set status='SUCCEEDED'::agent.run_status,output=jsonb_build_object(
    'suggestion_type','LINEAGE','suggestions_created',v_inserted,'inference_model','metadata-lineage-heuristics-v1',
    'observed_lineage',false,'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'),completed_at=now()
  where id=v_run_id;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,'USER','AI_LINEAGE_SUGGESTIONS_GENERATED','AGENT_RUN',v_run_id,jsonb_build_object(
    'suggestions_created',v_inserted,'source_id',p_source_id,'metadata_only',true,'observed_lineage',false,
    'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'));

  return jsonb_build_object('valid',true,'state','AI_LINEAGE_SUGGESTIONS_GENERATED','agent_run_id',v_run_id,
    'suggestions_created',v_inserted,'inference_model','metadata-lineage-heuristics-v1',
    'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION','observed_lineage',false);
exception when others then
  if v_run_id is not null then
    update agent.agent_runs set status='FAILED'::agent.run_status,error_message=sqlerrm,completed_at=now() where id=v_run_id;
  end if;
  raise;
end;
$$;

revoke all on function governance.generate_ai_lineage_suggestions(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function governance.generate_ai_lineage_suggestions(uuid,uuid,uuid,integer) to service_role;
