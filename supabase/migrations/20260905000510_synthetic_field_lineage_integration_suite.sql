create or replace function governance.run_synthetic_field_lineage_integration_suite()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare
  v_run_id uuid;
  v_org_id uuid;
  v_project_id uuid;
  v_source_asset_id uuid;
  v_target_asset_id uuid;
  v_transformation_id uuid;
  v_mapping_count integer;
  v_search_count integer;
  v_edge_count integer;
  v_checks jsonb := '{}'::jsonb;
  v_error text;
  v_suffix text := replace(gen_random_uuid()::text,'-','');
begin
  insert into governance.integration_test_runs default values returning id into v_run_id;
  begin
    insert into app.organizations(name,slug,metadata)
    values('Field Lineage Integration Test','field-lineage-it-'||left(v_suffix,10),jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_org_id;

    insert into app.projects(organization_id,name,slug,description,metadata)
    values(v_org_id,'Field Lineage Integration Test','field-lineage-it-'||left(v_suffix,10),'Self-cleaning synthetic field-lineage validation.',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_project_id;

    insert into governance.lineage_assets(project_id,namespace,name,asset_type,metadata)
    values(v_project_id,'synthetic_source','customer_source','TABLE',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_source_asset_id;

    insert into governance.lineage_assets(project_id,namespace,name,asset_type,metadata)
    values(v_project_id,'synthetic_target','customer_target','TABLE',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_target_asset_id;

    insert into governance.lineage_transformations(
      project_id,external_id,source_system,name,operation,logic_language,transformation_logic,logic_hash,metadata
    ) values (
      v_project_id,'field-lineage-it-'||v_suffix,'SYNTHETIC_DUE_DILIGENCE','Synthetic customer projection','SELECT','SQL',
      'select customer_id, email, country from synthetic_source.customer_source',
      md5('select customer_id, email, country from synthetic_source.customer_source'),
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id)
    ) returning id into v_transformation_id;

    insert into governance.lineage_column_mappings(
      project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata
    ) values
      (v_project_id,v_transformation_id,v_source_asset_id,'customer_id',v_target_asset_id,'customer_id','COPY','customer_id',jsonb_build_object('synthetic',true)),
      (v_project_id,v_transformation_id,v_source_asset_id,'email',v_target_asset_id,'email','COPY','email',jsonb_build_object('synthetic',true)),
      (v_project_id,v_transformation_id,v_source_asset_id,'country',v_target_asset_id,'country','COPY','country',jsonb_build_object('synthetic',true));

    insert into governance.lineage_edges(
      project_id,source_type,source_id,target_type,target_id,relationship,transformation_id,metadata
    ) values (
      v_project_id,'LINEAGE_ASSET',v_source_asset_id,'LINEAGE_ASSET',v_target_asset_id,'TRANSFORMS_TO',v_transformation_id,
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id)
    );

    select count(*) into v_mapping_count
    from governance.lineage_column_mappings
    where project_id=v_project_id and transformation_id=v_transformation_id;

    select count(*) into v_search_count
    from governance.search_field_lineage_anchors(v_project_id,'email',10);

    select count(*) into v_edge_count
    from governance.lineage_edges
    where project_id=v_project_id and transformation_id=v_transformation_id and relationship='TRANSFORMS_TO';

    v_checks := jsonb_build_object(
      'transformation_persisted', exists(select 1 from governance.lineage_transformations where id=v_transformation_id and project_id=v_project_id),
      'column_mapping_count', v_mapping_count,
      'column_mappings_complete', v_mapping_count=3,
      'field_anchor_search_count', v_search_count,
      'field_anchor_search_visible', v_search_count=2,
      'transformation_edge_count', v_edge_count,
      'transformation_edge_visible', v_edge_count=1
    );

    if v_mapping_count<>3 then raise exception 'Synthetic field lineage mappings were not persisted completely'; end if;
    if v_search_count<>2 then raise exception 'Synthetic field lineage anchors were not searchable'; end if;
    if v_edge_count<>1 then raise exception 'Synthetic transformation edge was not persisted'; end if;

    delete from app.organizations where id=v_org_id;
    v_org_id := null;
    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks,'self_cleaning',true);
  exception when others then
    v_error := sqlerrm;
    if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error,'self_cleaning',true);
  end;
end;
$$;

revoke all on function governance.run_synthetic_field_lineage_integration_suite() from public,anon,authenticated;
grant execute on function governance.run_synthetic_field_lineage_integration_suite() to service_role;
