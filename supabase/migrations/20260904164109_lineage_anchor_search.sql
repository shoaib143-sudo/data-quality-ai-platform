create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_datasets_name_trgm
  on catalog.datasets using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_datasets_source_identifier_trgm
  on catalog.datasets using gin (lower(coalesce(source_identifier,'')) extensions.gin_trgm_ops);
create index if not exists idx_data_sources_name_trgm
  on catalog.data_sources using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_lineage_assets_name_trgm
  on governance.lineage_assets using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists idx_lineage_assets_namespace_trgm
  on governance.lineage_assets using gin (lower(namespace) extensions.gin_trgm_ops);

create or replace function governance.search_lineage_anchors(
  p_project_id uuid,
  p_query text default '',
  p_limit integer default 25
)
returns table(
  anchor_type text,
  anchor_id uuid,
  label text,
  subtitle text,
  match_rank integer,
  metadata jsonb
)
language sql
security definer
set search_path = ''
as $$
  with params as (
    select lower(btrim(coalesce(p_query,''))) as q,
           greatest(1,least(coalesce(p_limit,25),50)) as result_limit
  ), anchors as (
    select
      'DATASET'::text as anchor_type,
      d.id as anchor_id,
      d.name as label,
      concat_ws(' · ',nullif(d.business_domain,''),nullif(d.source_identifier,''),d.status::text) as subtitle,
      case
        when p.q='' then 10
        when lower(d.name)=p.q then 0
        when lower(d.name) like p.q||'%' then 1
        when lower(d.source_identifier)=p.q then 1
        when lower(d.name) like '%'||p.q||'%' then 2
        when lower(coalesce(d.source_identifier,'')) like '%'||p.q||'%' then 3
        else 20
      end as match_rank,
      jsonb_build_object('status',d.status::text,'businessDomain',d.business_domain,'sourceIdentifier',d.source_identifier) as metadata
    from catalog.datasets d cross join params p
    where d.project_id=p_project_id
      and (p.q='' or lower(d.name) like '%'||p.q||'%' or lower(coalesce(d.source_identifier,'')) like '%'||p.q||'%')

    union all

    select
      'DATA_SOURCE'::text,
      ds.id,
      ds.name,
      concat_ws(' · ',ds.source_type,ds.status),
      case
        when p.q='' then 10
        when lower(ds.name)=p.q then 0
        when lower(ds.name) like p.q||'%' then 1
        when lower(ds.name) like '%'||p.q||'%' then 2
        else 20
      end,
      jsonb_build_object('sourceType',ds.source_type,'status',ds.status)
    from catalog.data_sources ds cross join params p
    where ds.project_id=p_project_id
      and (p.q='' or lower(ds.name) like '%'||p.q||'%')

    union all

    select
      'EXTERNAL_ASSET'::text,
      la.id,
      la.name,
      concat_ws(' · ',la.asset_type,la.namespace),
      case
        when p.q='' then 10
        when lower(la.name)=p.q then 0
        when lower(la.name) like p.q||'%' then 1
        when lower(la.name) like '%'||p.q||'%' then 2
        when lower(la.namespace) like '%'||p.q||'%' then 3
        else 20
      end,
      jsonb_build_object('assetType',la.asset_type,'namespace',la.namespace,'datasetId',la.dataset_id)
    from governance.lineage_assets la cross join params p
    where la.project_id=p_project_id
      and (p.q='' or lower(la.name) like '%'||p.q||'%' or lower(la.namespace) like '%'||p.q||'%')
  )
  select a.anchor_type,a.anchor_id,a.label,a.subtitle,a.match_rank,a.metadata
  from anchors a cross join params p
  order by a.match_rank,a.label,a.anchor_type,a.anchor_id
  limit (select result_limit from params)
$$;
revoke all on function governance.search_lineage_anchors(uuid,text,integer) from public,anon,authenticated;
grant execute on function governance.search_lineage_anchors(uuid,text,integer) to service_role;