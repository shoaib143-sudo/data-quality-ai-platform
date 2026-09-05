-- Source annotation history contains annotations, not the structural fact that a field exists.
create or replace function catalog.discovery_source_annotations(p_columns jsonb,p_metadata jsonb)
returns jsonb language plpgsql immutable set search_path to 'catalog','public' as $fn$
declare v_native jsonb:=case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)->'native_metadata')='object' then p_metadata->'native_metadata' else '{}'::jsonb end; v_columns jsonb;
begin
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'name',value->>'name',
    'comment',value->'metadata'->'comment',
    'description',value->'metadata'->'description'
  )) order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'),'[]'::jsonb)
  into v_columns
  from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb))
  where nullif(value->'metadata'->>'comment','') is not null or nullif(value->'metadata'->>'description','') is not null;
  return jsonb_strip_nulls(jsonb_build_object(
    'owner',v_native->'owner',
    'comment',coalesce(v_native->'comment',coalesce(p_metadata,'{}'::jsonb)->'remarks'),
    'description',v_native->'description',
    'tags',coalesce(v_native->'tags',v_native->'labels'),
    'columns',v_columns
  ));
end $fn$;

-- Semantic model correction: re-baseline current annotation hashes without manufacturing history.
update catalog.source_annotation_versions sav
set annotations=catalog.discovery_source_annotations(a.columns,a.metadata),
    annotation_hash=catalog.discovery_annotation_hash(a.columns,a.metadata)
from catalog.discovered_assets a
where sav.source_id=a.source_id and sav.is_current and a.is_current
  and (sav.identity_key=a.identity_key or (sav.identity_key is null and sav.asset_key=a.asset_key));

update catalog.discovered_assets
set source_annotation_hash=catalog.discovery_annotation_hash(columns,metadata)
where is_current;
