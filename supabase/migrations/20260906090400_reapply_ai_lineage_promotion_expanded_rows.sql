-- Reapply the expanded-row promotion function because the production 0903 migration had already been recorded before its corrected body was committed.
create or replace function governance.promote_ai_lineage_suggestion(p_suggestion_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_s governance.ai_governance_suggestions%rowtype;
  v_review_status text;
  v_source_discovered uuid;v_target_discovered uuid;v_source_col text;v_target_col text;
  v_source catalog.discovered_assets%rowtype;v_target catalog.discovered_assets%rowtype;
  v_source_lineage uuid;v_target_lineage uuid;
  v_existing_source governance.lineage_assets%rowtype;v_existing_target governance.lineage_assets%rowtype;
  v_edge jsonb;
begin
  if p_actor is null then raise exception 'Promotion requires an accountable actor'; end if;
  select s.* into v_s from governance.ai_governance_suggestions s where s.id=p_suggestion_id;
  if not found then raise exception 'AI lineage suggestion not found'; end if;
  select e.review_status into v_review_status from governance.ai_governance_suggestion_effective e where e.id=p_suggestion_id;
  if v_s.suggestion_type<>'LINEAGE' then raise exception 'Suggestion is not a lineage suggestion'; end if;
  if v_review_status<>'ACCEPTED' then raise exception 'AI lineage suggestion must be explicitly accepted before promotion'; end if;
  if not governance.has_project_capability(v_s.project_id,p_actor,'lineage.manage') then
    raise exception 'Actor is not authorized for lineage.manage in this project';
  end if;

  v_source_discovered:=nullif(v_s.suggestion->'source'->>'discovered_asset_id','')::uuid;
  v_target_discovered:=nullif(v_s.suggestion->'target'->>'discovered_asset_id','')::uuid;
  v_source_col:=btrim(v_s.suggestion->'source'->>'column');v_target_col:=btrim(v_s.suggestion->'target'->>'column');
  if v_source_discovered is null or v_target_discovered is null or v_source_col='' or v_target_col='' then
    raise exception 'Lineage suggestion payload is incomplete';
  end if;

  select a.* into v_source from catalog.discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
    where a.id=v_source_discovered and ds.project_id=v_s.project_id;
  if not found then raise exception 'Suggested source asset is not in current project catalog'; end if;
  select a.* into v_target from catalog.discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
    where a.id=v_target_discovered and ds.project_id=v_s.project_id;
  if not found then raise exception 'Suggested target asset is not in current project catalog'; end if;

  select la.* into v_existing_source from governance.lineage_assets la where la.discovered_asset_id=v_source.id and la.project_id=v_s.project_id limit 1;
  if found then v_source_lineage:=v_existing_source.id;
  else
    select la.* into v_existing_source from governance.lineage_assets la
      where la.project_id=v_s.project_id and la.namespace=coalesce(v_source.namespace,'') and la.name=v_source.name and la.asset_type=v_source.asset_type limit 1;
    if found and v_existing_source.data_source_id is distinct from v_source.source_id then
      raise exception 'LINEAGE_ASSET_IDENTITY_COLLISION for suggested source asset';
    elsif found then
      update governance.lineage_assets set discovered_asset_id=v_source.id,data_source_id=v_source.source_id,
        catalog_identity_key=coalesce(v_source.identity_key,v_source.asset_key),identity_resolution='CATALOG_IDENTITY',last_seen_at=now(),
        identity_evidence=coalesce(identity_evidence,'{}'::jsonb)||jsonb_build_object('ai_lineage_promotion',true)
      where id=v_existing_source.id returning id into v_source_lineage;
    else
      insert into governance.lineage_assets(project_id,data_source_id,discovered_asset_id,namespace,name,asset_type,catalog_identity_key,identity_resolution,identity_evidence,metadata)
      values(v_s.project_id,v_source.source_id,v_source.id,coalesce(v_source.namespace,''),v_source.name,v_source.asset_type,
        coalesce(v_source.identity_key,v_source.asset_key),'CATALOG_IDENTITY',jsonb_build_object('catalog_discovered_asset_id',v_source.id,'ai_lineage_promotion',true),
        jsonb_build_object('catalog_projection',true)) returning id into v_source_lineage;
    end if;
  end if;

  select la.* into v_existing_target from governance.lineage_assets la where la.discovered_asset_id=v_target.id and la.project_id=v_s.project_id limit 1;
  if found then v_target_lineage:=v_existing_target.id;
  else
    select la.* into v_existing_target from governance.lineage_assets la
      where la.project_id=v_s.project_id and la.namespace=coalesce(v_target.namespace,'') and la.name=v_target.name and la.asset_type=v_target.asset_type limit 1;
    if found and v_existing_target.data_source_id is distinct from v_target.source_id then
      raise exception 'LINEAGE_ASSET_IDENTITY_COLLISION for suggested target asset';
    elsif found then
      update governance.lineage_assets set discovered_asset_id=v_target.id,data_source_id=v_target.source_id,
        catalog_identity_key=coalesce(v_target.identity_key,v_target.asset_key),identity_resolution='CATALOG_IDENTITY',last_seen_at=now(),
        identity_evidence=coalesce(identity_evidence,'{}'::jsonb)||jsonb_build_object('ai_lineage_promotion',true)
      where id=v_existing_target.id returning id into v_target_lineage;
    else
      insert into governance.lineage_assets(project_id,data_source_id,discovered_asset_id,namespace,name,asset_type,catalog_identity_key,identity_resolution,identity_evidence,metadata)
      values(v_s.project_id,v_target.source_id,v_target.id,coalesce(v_target.namespace,''),v_target.name,v_target.asset_type,
        coalesce(v_target.identity_key,v_target.asset_key),'CATALOG_IDENTITY',jsonb_build_object('catalog_discovered_asset_id',v_target.id,'ai_lineage_promotion',true),
        jsonb_build_object('catalog_projection',true)) returning id into v_target_lineage;
    end if;
  end if;

  v_edge:=governance.upsert_manual_lineage_edge(v_s.project_id,p_actor,'EXTERNAL_ASSET',v_source_lineage,'EXTERNAL_ASSET',v_target_lineage,
    'REFERENTIAL_DEPENDENCY',jsonb_build_object(
      'ai_suggestion_id',v_s.id,'human_confirmed',true,'origin','HUMAN_CONFIRMED_AI_INFERRED',
      'source_column',v_source_col,'target_column',v_target_col,'observed_lineage',false,'source_authoritative_lineage',false,
      'truth_boundary','Human-confirmed metadata-inferred dependency; not source-observed transformation lineage.'));

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_s.project_id,p_actor,'USER','AI_LINEAGE_SUGGESTION_PROMOTED','AI_GOVERNANCE_SUGGESTION',v_s.id,
    jsonb_build_object('lineage_edge_id',v_edge->>'id','origin','HUMAN_CONFIRMED_AI_INFERRED','observed_lineage',false));

  return jsonb_build_object('valid',true,'state','HUMAN_CONFIRMED_AI_INFERRED','suggestion_id',v_s.id,'edge',v_edge,
    'observed_lineage',false,'module_3_blocker_cleared',false);
end;
$$;

revoke all on function governance.promote_ai_lineage_suggestion(uuid,uuid) from public,anon,authenticated;
grant execute on function governance.promote_ai_lineage_suggestion(uuid,uuid) to service_role;
