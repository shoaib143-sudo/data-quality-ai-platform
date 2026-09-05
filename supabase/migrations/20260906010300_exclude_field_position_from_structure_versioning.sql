-- Field position is already represented by the structural ordinal. Connector locator evidence must not manufacture physical versions.
create or replace function catalog.discovery_structure_payload(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb)
returns jsonb language plpgsql immutable set search_path to 'catalog','public' as $fn$
declare
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb)-array['row_count','validation_details','validation_errors','validation_warnings','remarks'];
  v_native jsonb;
  v_columns jsonb;
begin
  if jsonb_typeof(v_metadata->'native_metadata')='object' then
    v_native:=(v_metadata->'native_metadata')-array['owner','comment','description','tags','labels'];
    v_metadata:=jsonb_set(v_metadata,'{native_metadata}',v_native,true);
  end if;
  select coalesce(jsonb_agg(
    (value-array['native_id','qualified_name','native_identity']) ||
    case when jsonb_typeof(value->'metadata')='object'
      then jsonb_build_object('metadata',(value->'metadata')-array['comment','description','tags','labels','table_id','object_oid','attnum','parent_native_id','identity_evidence','native_identity','position'])
      else '{}'::jsonb end
    order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'),'[]'::jsonb)
  into v_columns
  from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb));
  return jsonb_build_object('asset_type',p_asset_type,'namespace',p_namespace,'name',p_name,'columns',v_columns,'metadata',v_metadata);
end $fn$;

-- Collapse only current versions that can be proven to be duplicate physical structures under the corrected contract.
-- The correction is deliberately conservative: same stable identity/path, same source annotations, one pure CHANGED event,
-- no other asset event for that identity, and no field-level change evidence.
create temporary table _catalog_locator_duplicate_versions on commit drop as
select
  cur.id as current_id,
  prev.id as previous_id,
  cur.source_id,
  cur.identity_key,
  cur.asset_key,
  cur.discovery_run_id as run_id,
  dr.catalog_revision_id as revision_id,
  cur.columns as current_columns,
  cur.metadata as current_metadata,
  cur.source_annotation_hash as current_annotation_hash,
  cur.last_seen_at as current_last_seen_at,
  cur.last_seen_run_id as current_last_seen_run_id
from catalog.discovered_assets cur
join catalog.discovered_assets prev
  on prev.source_id=cur.source_id
 and prev.identity_key=cur.identity_key
 and prev.version_number=cur.version_number-1
 and prev.id<>cur.id
join catalog.discovery_runs dr on dr.id=cur.discovery_run_id
where cur.is_current
  and cur.identity_key is not null
  and cur.asset_key=prev.asset_key
  and cur.source_annotation_hash is not distinct from prev.source_annotation_hash
  and dr.catalog_revision_id is not null
  and catalog.discovery_structure_hash(cur.asset_type,cur.namespace,cur.name,cur.columns,cur.metadata)
      = catalog.discovery_structure_hash(prev.asset_type,prev.namespace,prev.name,prev.columns,prev.metadata)
  and exists (
    select 1 from catalog.catalog_change_events e
    where e.revision_id=dr.catalog_revision_id
      and e.change_type='CHANGED'
      and e.previous_asset_id=prev.id
      and e.current_asset_id=cur.id
  )
  and not exists (
    select 1 from catalog.catalog_change_events e
    where e.revision_id=dr.catalog_revision_id
      and coalesce(e.identity_key,e.asset_key)=coalesce(cur.identity_key,cur.asset_key)
      and e.change_type<>'CHANGED'
  )
  and not exists (
    select 1 from catalog.catalog_field_change_events f
    where f.revision_id=dr.catalog_revision_id
      and f.asset_identity_key=cur.identity_key
  );

create temporary table _catalog_locator_affected_revisions on commit drop as
select revision_id,run_id,count(*)::integer as collapsed_versions
from _catalog_locator_duplicate_versions
group by revision_id,run_id;

update catalog.scope_asset_state s
set discovered_asset_id=d.previous_id,updated_at=now()
from _catalog_locator_duplicate_versions d
where s.discovered_asset_id=d.current_id;

update catalog.asset_promotion_requests p
set discovered_asset_id=d.previous_id
from _catalog_locator_duplicate_versions d
where p.discovered_asset_id=d.current_id;

delete from catalog.catalog_change_events e
using _catalog_locator_duplicate_versions d
where e.revision_id=d.revision_id
  and e.change_type='CHANGED'
  and e.previous_asset_id=d.previous_id
  and e.current_asset_id=d.current_id;

-- Remove the duplicate row, then promote the prior true physical version while carrying forward the latest observation/evidence.
delete from catalog.discovered_assets a
using _catalog_locator_duplicate_versions d
where a.id=d.current_id;

update catalog.discovered_assets p
set
  is_current=true,
  retired_at=null,
  last_seen_at=d.current_last_seen_at,
  last_seen_run_id=d.current_last_seen_run_id,
  columns=d.current_columns,
  metadata=d.current_metadata,
  identity_key=d.identity_key,
  source_annotation_hash=d.current_annotation_hash,
  structure_hash=catalog.discovery_structure_hash(p.asset_type,p.namespace,p.name,d.current_columns,d.current_metadata),
  content_hash=catalog.discovery_structure_hash(p.asset_type,p.namespace,p.name,d.current_columns,d.current_metadata)
from _catalog_locator_duplicate_versions d
where p.id=d.previous_id;

-- Correct the affected published revision/run evidence without erasing that the reconciliation itself occurred.
update catalog.catalog_revisions r
set
  objects_changed=(
    select count(distinct coalesce(e.identity_key,e.asset_key))::integer
    from catalog.catalog_change_events e
    where e.revision_id=r.id and e.change_type in ('CHANGED','RESTORED','RENAMED','MOVED')
  ),
  objects_unchanged=greatest(0,r.objects_observed-r.objects_added-(
    select count(distinct coalesce(e.identity_key,e.asset_key))::integer
    from catalog.catalog_change_events e
    where e.revision_id=r.id and e.change_type in ('CHANGED','RESTORED','RENAMED','MOVED')
  )),
  metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
    'normalization_correction',jsonb_build_object(
      'code','FIELD_LOCATOR_POSITION_EXCLUDED_FROM_STRUCTURE',
      'collapsed_versions',(select a.collapsed_versions from _catalog_locator_affected_revisions a where a.revision_id=r.id),
      'applied_at',now()
    )
  )
where r.id in (select revision_id from _catalog_locator_affected_revisions);

update catalog.catalog_revisions r
set change_set_hash=catalog.catalog_json_hash(jsonb_build_object(
  'asset_events',coalesce((select jsonb_agg(jsonb_build_object('identity_key',identity_key,'asset_key',asset_key,'change_type',change_type,'details',details) order by identity_key,asset_key,change_type) from catalog.catalog_change_events where revision_id=r.id),'[]'::jsonb),
  'field_events',coalesce((select jsonb_agg(jsonb_build_object('asset_identity_key',asset_identity_key,'field_identity_key',field_identity_key,'event_type',event_type,'before',before_state,'after',after_state) order by asset_identity_key,field_identity_key,event_type) from catalog.catalog_field_change_events where revision_id=r.id),'[]'::jsonb)
))
where r.id in (select revision_id from _catalog_locator_affected_revisions);

update catalog.discovery_runs dr
set
  objects_changed=r.objects_changed,
  objects_unchanged=r.objects_unchanged,
  schema_snapshot=jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(dr.schema_snapshot,'{}'::jsonb),'{publication,objects_changed}',to_jsonb(r.objects_changed),true),
      '{publication,objects_unchanged}',to_jsonb(r.objects_unchanged),true
    ),
    '{publication,change_set_hash}',to_jsonb(r.change_set_hash),true
  )
from catalog.catalog_revisions r
where dr.catalog_revision_id=r.id
  and r.id in (select revision_id from _catalog_locator_affected_revisions);
