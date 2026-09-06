-- AI-assisted metadata lineage suggestions.
-- Truth boundary: these records are derived hypotheses, never source-observed lineage.

alter table governance.ai_governance_suggestions
  drop constraint if exists ai_governance_suggestions_suggestion_type_check;

alter table governance.ai_governance_suggestions
  add constraint ai_governance_suggestions_suggestion_type_check
  check (suggestion_type = any (array[
    'CLASSIFICATION'::text,'QUALITY_RULE'::text,'GLOSSARY'::text,'OWNERSHIP'::text,
    'POLICY_CONTROL'::text,'CONTRACT'::text,'WORKFLOW'::text,'LINEAGE'::text,'OTHER'::text
  ]));

create or replace function governance.ai_suggestion_review_capability(p_suggestion_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case upper(p_suggestion_type)
    when 'CLASSIFICATION' then 'classification.review'
    when 'QUALITY_RULE' then 'quality.manage'
    when 'GLOSSARY' then 'glossary.manage'
    when 'OWNERSHIP' then 'stewardship.manage'
    when 'POLICY_CONTROL' then 'policy.approve'
    when 'CONTRACT' then 'contract.approve'
    when 'WORKFLOW' then 'workflow.manage'
    when 'LINEAGE' then 'lineage.manage'
    else 'catalog.update'
  end;
$$;

create or replace function governance.record_ai_governance_suggestion(
  p_project_id uuid,
  p_source_agent_run_id uuid,
  p_suggestion_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_target_locator text,
  p_suggestion jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_confidence numeric default null,
  p_source_artifact_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','governance','agent','extensions'
as $$
declare
  v_id uuid := gen_random_uuid();
  v_type text := upper(btrim(coalesce(p_suggestion_type,'')));
  v_hash text;
begin
  if v_type not in ('CLASSIFICATION','QUALITY_RULE','GLOSSARY','OWNERSHIP','POLICY_CONTROL','CONTRACT','WORKFLOW','LINEAGE','OTHER') then
    raise exception 'Unsupported AI governance suggestion type';
  end if;
  if not exists(select 1 from agent.agent_runs r where r.id=p_source_agent_run_id and r.project_id=p_project_id) then
    raise exception 'Source agent run is outside project scope';
  end if;
  if p_source_artifact_id is not null and not exists(
    select 1 from agent.agent_artifacts a where a.id=p_source_artifact_id and a.agent_run_id=p_source_agent_run_id
  ) then raise exception 'Source artifact is not part of source agent run'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then raise exception 'Confidence must be between 0 and 1'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Suggestion expiry must be in the future'; end if;
  if p_suggestion is null or p_suggestion='null'::jsonb then raise exception 'Suggestion payload is required'; end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'project_id',p_project_id,'source_agent_run_id',p_source_agent_run_id,'source_artifact_id',p_source_artifact_id,
    'suggestion_type',v_type,'subject_type',btrim(p_subject_type),'subject_id',p_subject_id,'target_locator',p_target_locator,
    'suggestion',p_suggestion,'evidence',coalesce(p_evidence,'{}'::jsonb),'confidence',p_confidence,'expires_at',p_expires_at
  )::text,'UTF8'),'sha256'),'hex');

  insert into governance.ai_governance_suggestions(
    id,project_id,source_agent_run_id,source_artifact_id,suggestion_type,subject_type,subject_id,target_locator,
    suggestion,evidence,confidence,expires_at,content_hash
  ) values(
    v_id,p_project_id,p_source_agent_run_id,p_source_artifact_id,v_type,btrim(p_subject_type),p_subject_id,p_target_locator,
    p_suggestion,coalesce(p_evidence,'{}'::jsonb),p_confidence,p_expires_at,v_hash
  )
  on conflict(project_id,source_agent_run_id,content_hash) do update set content_hash=excluded.content_hash
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function governance.generate_ai_lineage_suggestions(
  p_project_id uuid,
  p_actor uuid,
  p_source_id uuid default null,
  p_max_suggestions integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  where d.agent_key='architect' and d.enabled=true
  order by d.created_at desc,d.id desc
  limit 1;
  if v_definition_id is null then raise exception 'Enabled architect agent definition is required'; end if;

  insert into agent.agent_runs(agent_definition_id,project_id,status,input,started_at)
  values(v_definition_id,p_project_id,'RUNNING'::agent.run_status,
    jsonb_build_object(
      'task','AI_LINEAGE_METADATA_INFERENCE',
      'source_id',p_source_id,
      'max_suggestions',v_limit,
      'requested_by',p_actor,
      'inference_model','metadata-lineage-heuristics-v1',
      'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'
    ),now())
  returning id into v_run_id;

  for v_candidate in
    with assets as (
      select a.id,a.source_id,a.asset_type,a.namespace,a.name,a.columns,a.asset_key
      from catalog.current_discovered_assets a
      join catalog.data_sources ds on ds.id=a.source_id
      where ds.project_id=p_project_id
        and ds.status::text='ACTIVE'
        and (p_source_id is null or a.source_id=p_source_id)
        and upper(a.asset_type) in ('TABLE','VIEW')
        and jsonb_typeof(a.columns)='array'
    ),
    source_columns as (
      select a.*,
        lower(btrim(c.value->>'name')) as source_column,
        regexp_replace(lower(btrim(c.value->>'name')),'(_id|_key)$','') as entity_prefix,
        case when lower(btrim(c.value->>'name')) like '%\_id' escape '\' then 'ID_SUFFIX' else 'KEY_SUFFIX' end as suffix_kind
      from assets a
      cross join lateral jsonb_array_elements(a.columns) c(value)
      where lower(btrim(c.value->>'name')) like '%\_id' escape '\'
         or lower(btrim(c.value->>'name')) like '%\_key' escape '\'
    ),
    target_assets as (
      select a.*,
        case
          when lower(a.name) like '%ies' then regexp_replace(lower(a.name),'ies$','y')
          when lower(a.name) like '%s' and lower(a.name) not like '%ss' then regexp_replace(lower(a.name),'s$','')
          else lower(a.name)
        end as entity_name
      from assets a
    ),
    candidates as (
      select
        s.id as source_asset_id,s.source_id,s.namespace as source_namespace,s.name as source_name,s.asset_key as source_asset_key,
        s.source_column,s.suffix_kind,
        t.id as target_asset_id,t.namespace as target_namespace,t.name as target_name,t.asset_key as target_asset_key,
        tk.target_column,
        case
          when s.namespace=t.namespace and tk.target_column='id' then 0.96::numeric
          when tk.target_column='id' then 0.93::numeric
          when s.namespace=t.namespace then 0.90::numeric
          else 0.87::numeric
        end as confidence
      from source_columns s
      join target_assets t on t.source_id=s.source_id and t.id<>s.id and t.entity_name=s.entity_prefix
      cross join lateral (
        select lower(btrim(tc.value->>'name')) as target_column
        from jsonb_array_elements(t.columns) tc(value)
        where lower(btrim(tc.value->>'name')) in ('id',s.source_column)
        order by case when lower(btrim(tc.value->>'name'))='id' then 0 else 1 end
        limit 1
      ) tk
      where not exists(
        select 1
        from governance.ai_governance_suggestions existing
        where existing.project_id=p_project_id
          and existing.suggestion_type='LINEAGE'
          and existing.suggestion->'source'->>'discovered_asset_id'=s.id::text
          and lower(existing.suggestion->'source'->>'column')=s.source_column
          and existing.suggestion->'target'->>'discovered_asset_id'=t.id::text
          and lower(existing.suggestion->'target'->>'column')=tk.target_column
      )
      order by confidence desc,s.namespace,s.name,s.source_column,t.namespace,t.name
      limit v_limit
    )
    select * from candidates
  loop
    perform governance.record_ai_governance_suggestion(
      p_project_id,
      v_run_id,
      'LINEAGE',
      'DISCOVERED_FIELD',
      v_candidate.source_asset_id,
      v_candidate.target_asset_id::text||':'||v_candidate.target_column,
      jsonb_build_object(
        'kind','FIELD_DEPENDENCY_CANDIDATE',
        'origin','AI_INFERRED_METADATA',
        'relationship','REFERENTIAL_DEPENDENCY',
        'direction','SOURCE_DEPENDS_ON_TARGET',
        'authority','SUGGESTION_ONLY',
        'source',jsonb_build_object(
          'discovered_asset_id',v_candidate.source_asset_id,
          'catalog_identity_key',v_candidate.source_asset_key,
          'namespace',v_candidate.source_namespace,
          'asset',v_candidate.source_name,
          'column',v_candidate.source_column
        ),
        'target',jsonb_build_object(
          'discovered_asset_id',v_candidate.target_asset_id,
          'catalog_identity_key',v_candidate.target_asset_key,
          'namespace',v_candidate.target_namespace,
          'asset',v_candidate.target_name,
          'column',v_candidate.target_column
        )
      ),
      jsonb_build_object(
        'metadata_only',true,
        'observed_lineage',false,
        'source_authoritative_lineage',false,
        'inference_model','metadata-lineage-heuristics-v1',
        'signals',jsonb_build_array(
          'SOURCE_COLUMN_'||v_candidate.suffix_kind,
          'TARGET_ENTITY_NAME_MATCH',
          'TARGET_KEY_PRESENT',
          case when v_candidate.source_namespace=v_candidate.target_namespace then 'SAME_NAMESPACE' else 'CROSS_NAMESPACE' end
        ),
        'truth_boundary','Candidate dependency inferred from catalog metadata. It is not source-observed transformation or field lineage.'
      ),
      v_candidate.confidence,
      null,
      null
    );
    v_inserted := v_inserted+1;
  end loop;

  update agent.agent_runs
  set status='SUCCEEDED'::agent.run_status,
      output=jsonb_build_object(
        'suggestion_type','LINEAGE',
        'suggestions_created',v_inserted,
        'inference_model','metadata-lineage-heuristics-v1',
        'observed_lineage',false,
        'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'
      ),
      completed_at=now()
  where id=v_run_id;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,'USER','AI_LINEAGE_SUGGESTIONS_GENERATED','AGENT_RUN',v_run_id,
    jsonb_build_object('suggestions_created',v_inserted,'source_id',p_source_id,'metadata_only',true,'observed_lineage',false,'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION'));

  return jsonb_build_object(
    'valid',true,
    'state','AI_LINEAGE_SUGGESTIONS_GENERATED',
    'agent_run_id',v_run_id,
    'suggestions_created',v_inserted,
    'inference_model','metadata-lineage-heuristics-v1',
    'authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION',
    'observed_lineage',false
  );
exception when others then
  if v_run_id is not null then
    update agent.agent_runs set status='FAILED'::agent.run_status,error_message=sqlerrm,completed_at=now() where id=v_run_id;
  end if;
  raise;
end;
$$;

create or replace function governance.promote_ai_lineage_suggestion(
  p_suggestion_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_s governance.ai_governance_suggestions%rowtype;
  v_review_status text;
  v_source_discovered uuid;
  v_target_discovered uuid;
  v_source_col text;
  v_target_col text;
  v_source catalog.discovered_assets%rowtype;
  v_target catalog.discovered_assets%rowtype;
  v_source_lineage uuid;
  v_target_lineage uuid;
  v_existing_source governance.lineage_assets%rowtype;
  v_existing_target governance.lineage_assets%rowtype;
  v_edge jsonb;
begin
  if p_actor is null then raise exception 'Promotion requires an accountable actor'; end if;
  select s.*,e.review_status into v_s,v_review_status
  from governance.ai_governance_suggestions s
  join governance.ai_governance_suggestion_effective e on e.id=s.id
  where s.id=p_suggestion_id;
  if not found then raise exception 'AI lineage suggestion not found'; end if;
  if v_s.suggestion_type<>'LINEAGE' then raise exception 'Suggestion is not a lineage suggestion'; end if;
  if v_review_status<>'ACCEPTED' then raise exception 'AI lineage suggestion must be explicitly accepted before promotion'; end if;
  if not governance.has_project_capability(v_s.project_id,p_actor,'lineage.manage') then
    raise exception 'Actor is not authorized for lineage.manage in this project';
  end if;

  v_source_discovered := nullif(v_s.suggestion->'source'->>'discovered_asset_id','')::uuid;
  v_target_discovered := nullif(v_s.suggestion->'target'->>'discovered_asset_id','')::uuid;
  v_source_col := btrim(v_s.suggestion->'source'->>'column');
  v_target_col := btrim(v_s.suggestion->'target'->>'column');
  if v_source_discovered is null or v_target_discovered is null or v_source_col='' or v_target_col='' then
    raise exception 'Lineage suggestion payload is incomplete';
  end if;

  select a.* into v_source from catalog.discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
  where a.id=v_source_discovered and ds.project_id=v_s.project_id;
  if not found then raise exception 'Suggested source asset is not in current project catalog'; end if;
  select a.* into v_target from catalog.discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
  where a.id=v_target_discovered and ds.project_id=v_s.project_id;
  if not found then raise exception 'Suggested target asset is not in current project catalog'; end if;

  select * into v_existing_source from governance.lineage_assets where discovered_asset_id=v_source.id and project_id=v_s.project_id limit 1;
  if found then
    v_source_lineage:=v_existing_source.id;
  else
    select * into v_existing_source from governance.lineage_assets
      where project_id=v_s.project_id and namespace=coalesce(v_source.namespace,'') and name=v_source.name and asset_type=v_source.asset_type limit 1;
    if found and v_existing_source.data_source_id is distinct from v_source.source_id then
      raise exception 'LINEAGE_ASSET_IDENTITY_COLLISION for suggested source asset';
    end if;
    if found then
      update governance.lineage_assets set discovered_asset_id=v_source.id,data_source_id=v_source.source_id,catalog_identity_key=v_source.asset_key,
        identity_resolution='CATALOG_IDENTITY',last_seen_at=now(),identity_evidence=coalesce(identity_evidence,'{}'::jsonb)||jsonb_build_object('ai_lineage_promotion',true)
      where id=v_existing_source.id returning id into v_source_lineage;
    else
      insert into governance.lineage_assets(project_id,data_source_id,discovered_asset_id,namespace,name,asset_type,catalog_identity_key,identity_resolution,identity_evidence,metadata)
      values(v_s.project_id,v_source.source_id,v_source.id,coalesce(v_source.namespace,''),v_source.name,v_source.asset_type,v_source.asset_key,'CATALOG_IDENTITY',
        jsonb_build_object('catalog_discovered_asset_id',v_source.id,'ai_lineage_promotion',true),jsonb_build_object('catalog_projection',true))
      returning id into v_source_lineage;
    end if;
  end if;

  select * into v_existing_target from governance.lineage_assets where discovered_asset_id=v_target.id and project_id=v_s.project_id limit 1;
  if found then
    v_target_lineage:=v_existing_target.id;
  else
    select * into v_existing_target from governance.lineage_assets
      where project_id=v_s.project_id and namespace=coalesce(v_target.namespace,'') and name=v_target.name and asset_type=v_target.asset_type limit 1;
    if found and v_existing_target.data_source_id is distinct from v_target.source_id then
      raise exception 'LINEAGE_ASSET_IDENTITY_COLLISION for suggested target asset';
    end if;
    if found then
      update governance.lineage_assets set discovered_asset_id=v_target.id,data_source_id=v_target.source_id,catalog_identity_key=v_target.asset_key,
        identity_resolution='CATALOG_IDENTITY',last_seen_at=now(),identity_evidence=coalesce(identity_evidence,'{}'::jsonb)||jsonb_build_object('ai_lineage_promotion',true)
      where id=v_existing_target.id returning id into v_target_lineage;
    else
      insert into governance.lineage_assets(project_id,data_source_id,discovered_asset_id,namespace,name,asset_type,catalog_identity_key,identity_resolution,identity_evidence,metadata)
      values(v_s.project_id,v_target.source_id,v_target.id,coalesce(v_target.namespace,''),v_target.name,v_target.asset_type,v_target.asset_key,'CATALOG_IDENTITY',
        jsonb_build_object('catalog_discovered_asset_id',v_target.id,'ai_lineage_promotion',true),jsonb_build_object('catalog_projection',true))
      returning id into v_target_lineage;
    end if;
  end if;

  v_edge := governance.upsert_manual_lineage_edge(
    v_s.project_id,p_actor,'EXTERNAL_ASSET',v_source_lineage,'EXTERNAL_ASSET',v_target_lineage,'REFERENTIAL_DEPENDENCY',
    jsonb_build_object(
      'ai_suggestion_id',v_s.id,
      'human_confirmed',true,
      'origin','HUMAN_CONFIRMED_AI_INFERRED',
      'source_column',v_source_col,
      'target_column',v_target_col,
      'observed_lineage',false,
      'source_authoritative_lineage',false,
      'truth_boundary','Human-confirmed metadata-inferred dependency; not source-observed transformation lineage.'
    )
  );

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_s.project_id,p_actor,'USER','AI_LINEAGE_SUGGESTION_PROMOTED','AI_GOVERNANCE_SUGGESTION',v_s.id,
    jsonb_build_object('lineage_edge_id',v_edge->>'id','origin','HUMAN_CONFIRMED_AI_INFERRED','observed_lineage',false));

  return jsonb_build_object('valid',true,'state','HUMAN_CONFIRMED_AI_INFERRED','suggestion_id',v_s.id,'edge',v_edge,
    'observed_lineage',false,'module_3_blocker_cleared',false);
end;
$$;

create or replace function governance.verify_ai_lineage_suggestion_posture(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_suggestions integer;
  v_accepted integer;
  v_promoted integer;
  v_truth_violations integer;
  v_auto_authority_violations integer;
  v_generator_authenticated boolean;
  v_promoter_authenticated boolean;
  v_lineage_capability text;
begin
  select count(*) into v_suggestions from governance.ai_governance_suggestions where project_id=p_project_id and suggestion_type='LINEAGE';
  select count(*) into v_accepted from governance.ai_governance_suggestion_effective where project_id=p_project_id and suggestion_type='LINEAGE' and review_status='ACCEPTED';
  select count(*) into v_promoted from governance.lineage_edges where project_id=p_project_id and metadata ? 'ai_suggestion_id';
  select count(*) into v_truth_violations from governance.ai_governance_suggestions
    where project_id=p_project_id and suggestion_type='LINEAGE'
      and (coalesce((evidence->>'metadata_only')::boolean,false)=false
        or coalesce((evidence->>'observed_lineage')::boolean,true)=true
        or coalesce((suggestion->>'authority'),'')<>'SUGGESTION_ONLY');
  select count(*) into v_auto_authority_violations from governance.lineage_edges
    where project_id=p_project_id and metadata ? 'ai_suggestion_id'
      and (coalesce((metadata->>'human_confirmed')::boolean,false)=false
        or coalesce((metadata->>'observed_lineage')::boolean,true)=true
        or coalesce(metadata->>'origin','')<>'HUMAN_CONFIRMED_AI_INFERRED');
  v_generator_authenticated := has_function_privilege('authenticated','governance.generate_ai_lineage_suggestions(uuid,uuid,uuid,integer)','EXECUTE');
  v_promoter_authenticated := has_function_privilege('authenticated','governance.promote_ai_lineage_suggestion(uuid,uuid)','EXECUTE');
  v_lineage_capability := governance.ai_suggestion_review_capability('LINEAGE');

  return jsonb_build_object(
    'valid',v_truth_violations=0 and v_auto_authority_violations=0 and not v_generator_authenticated and not v_promoter_authenticated and v_lineage_capability='lineage.manage',
    'state','AI_LINEAGE_SUGGESTION_BOUNDARY_GOVERNED',
    'suggestions',v_suggestions,
    'accepted_suggestions',v_accepted,
    'human_promoted_dependencies',v_promoted,
    'truth_boundary_violations',v_truth_violations,
    'automatic_authority_violations',v_auto_authority_violations,
    'review_capability',v_lineage_capability,
    'authenticated_generator_execute',v_generator_authenticated,
    'authenticated_promoter_execute',v_promoter_authenticated,
    'suggestion_authority_effect','NO_AUTOMATIC_LINEAGE_MUTATION',
    'promotion_semantics','EXPLICIT_HUMAN_ACCEPTANCE_PLUS_SEPARATE_LINEAGE_MANAGE_ACTION',
    'source_authoritative_lineage_claimed',false,
    'module_3_blocker_cleared',false
  );
end;
$$;

revoke all on function governance.generate_ai_lineage_suggestions(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function governance.generate_ai_lineage_suggestions(uuid,uuid,uuid,integer) to service_role;
revoke all on function governance.promote_ai_lineage_suggestion(uuid,uuid) from public,anon,authenticated;
grant execute on function governance.promote_ai_lineage_suggestion(uuid,uuid) to service_role;
revoke all on function governance.verify_ai_lineage_suggestion_posture(uuid) from public,anon,authenticated;
grant execute on function governance.verify_ai_lineage_suggestion_posture(uuid) to service_role;
