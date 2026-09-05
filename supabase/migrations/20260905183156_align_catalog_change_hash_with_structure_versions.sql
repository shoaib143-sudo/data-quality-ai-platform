create or replace function catalog.discovery_content_hash(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb) returns text
language sql immutable set search_path=catalog,public,extensions as $$
  select catalog.discovery_structure_hash(p_asset_type,p_namespace,p_name,p_columns,p_metadata)
$$;
revoke all on function catalog.discovery_content_hash(text,text,text,jsonb,jsonb) from public,anon,authenticated;
