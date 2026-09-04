create index if not exists lineage_column_mappings_source_column_trgm_idx
  on governance.lineage_column_mappings using gin (lower(source_column) extensions.gin_trgm_ops)
  where source_column is not null;

create index if not exists lineage_column_mappings_target_column_trgm_idx
  on governance.lineage_column_mappings using gin (lower(target_column) extensions.gin_trgm_ops)
  where target_column is not null;

create or replace function governance.search_field_lineage_anchors(
  p_project_id uuid,
  p_query text default '',
  p_limit integer default 25
)
returns table (
  asset_id uuid,
  column_name text,
  label text,
  subtitle text,
  dataset_id uuid,
  asset_type text,
  match_rank integer
)
language sql
stable
security definer
set search_path = pg_catalog, governance, catalog, extensions
as $$
  with field_refs as (
    select m.source_asset_id as asset_id, m.source_column as column_name
    from governance.lineage_column_mappings m
    where m.project_id = p_project_id
      and m.source_asset_id is not null
      and m.source_column is not null
    union
    select m.target_asset_id as asset_id, m.target_column as column_name
    from governance.lineage_column_mappings m
    where m.project_id = p_project_id
      and m.target_asset_id is not null
      and m.target_column is not null
  ), ranked as (
    select
      f.asset_id,
      f.column_name,
      concat_ws(' · ', nullif(a.namespace, ''), a.name) || '.' || f.column_name as label,
      a.asset_type || case when a.dataset_id is not null then ' · linked dataset' else '' end as subtitle,
      a.dataset_id,
      a.asset_type,
      case
        when lower(f.column_name) = lower(btrim(coalesce(p_query, ''))) then 0
        when lower(f.column_name) like lower(btrim(coalesce(p_query, ''))) || '%' then 1
        when lower(a.name) = lower(btrim(coalesce(p_query, ''))) then 2
        when lower(a.name) like lower(btrim(coalesce(p_query, ''))) || '%' then 3
        else 4
      end as match_rank
    from field_refs f
    join governance.lineage_assets a
      on a.id = f.asset_id
     and a.project_id = p_project_id
    where btrim(coalesce(p_query, '')) = ''
       or lower(f.column_name) like '%' || lower(btrim(p_query)) || '%'
       or lower(a.name) like '%' || lower(btrim(p_query)) || '%'
       or lower(a.namespace) like '%' || lower(btrim(p_query)) || '%'
  )
  select r.asset_id, r.column_name, r.label, r.subtitle, r.dataset_id, r.asset_type, r.match_rank
  from ranked r
  order by r.match_rank, r.label
  limit greatest(1, least(coalesce(p_limit, 25), 50));
$$;

revoke all on function governance.search_field_lineage_anchors(uuid,text,integer) from public, anon, authenticated;
grant execute on function governance.search_field_lineage_anchors(uuid,text,integer) to service_role;
