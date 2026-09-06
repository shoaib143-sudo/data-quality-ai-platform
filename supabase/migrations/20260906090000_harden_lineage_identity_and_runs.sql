-- Technical + field lineage hardening.
-- Lineage remains source-authoritative while DataNexus binds observed graph nodes to stable catalog identities and durable enrichment evidence.

alter table governance.lineage_assets
  add column if not exists data_source_id uuid references catalog.data_sources(id) on delete set null,
  add column if not exists catalog_identity_key text,
  add column if not exists discovered_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  add column if not exists catalog_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  add column if not exists identity_resolution text,
  add column if not exists identity_evidence jsonb not null default '{}'::jsonb;

alter table governance.lineage_assets drop constraint if exists lineage_assets_identity_resolution_check;
alter table governance.lineage_assets add constraint lineage_assets_identity_resolution_check
  check (identity_resolution is null or identity_resolution in ('CATALOG_IDENTITY','QUALIFIED_LOCATOR','EXTERNAL_DEPENDENCY','DATASET_ONLY'));

create index if not exists lineage_assets_catalog_identity_idx
  on governance.lineage_assets(data_source_id,catalog_identity_key)
  where data_source_id is not null and catalog_identity_key is not null;
create unique index if not exists lineage_assets_one_catalog_identity
  on governance.lineage_assets(data_source_id,catalog_identity_key)
  where data_source_id is not null and catalog_identity_key is not null;
create index if not exists lineage_assets_discovered_asset_idx
  on governance.lineage_assets(discovered_asset_id)
  where discovered_asset_id is not null;

comment on column governance.lineage_assets.catalog_identity_key is 'Stable catalog identity bound from source-authoritative metadata; qualified locators remain fallback evidence only.';
comment on column governance.lineage_assets.identity_resolution is 'How this lineage node was resolved: stable catalog identity, qualified locator, external dependency, or dataset-only.';

alter table governance.lineage_ingestion_events
  add column if not exists data_source_id uuid references catalog.data_sources(id) on delete set null,
  add column if not exists discovery_run_id uuid references catalog.discovery_runs(id) on delete set null,
  add column if not exists catalog_revision_id uuid references catalog.catalog_revisions(id) on delete set null;
create index if not exists lineage_ingestion_events_revision_idx
  on governance.lineage_ingestion_events(data_source_id,catalog_revision_id,received_at desc)
  where data_source_id is not null and catalog_revision_id is not null;

create table if not exists governance.lineage_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  discovery_run_id uuid not null references catalog.discovery_runs(id) on delete cascade,
  catalog_revision_id uuid not null references catalog.catalog_revisions(id) on delete cascade,
  status text not null check (status in ('RUNNING','COMPLETED','COMPLETED_WITH_WARNINGS','BLOCKED','FAILED','NOT_APPLICABLE')),
  authoritative_sources text[] not null default '{}'::text[],
  scope_catalogs text[] not null default '{}'::text[],
  complete boolean not null default false,
  truncated boolean not null default false,
  transformation_count integer not null default 0 check (transformation_count >= 0),
  edge_count integer not null default 0 check (edge_count >= 0),
  column_mapping_count integer not null default 0 check (column_mapping_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  blocker_code text,
  blocker_resource text,
  blocker_permission text,
  blocker_detail text,
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(source_id,catalog_revision_id)
);
create index if not exists lineage_enrichment_runs_project_recent_idx
  on governance.lineage_enrichment_runs(project_id,started_at desc);
create index if not exists lineage_enrichment_runs_source_recent_idx
  on governance.lineage_enrichment_runs(source_id,started_at desc);
alter table governance.lineage_enrichment_runs enable row level security;
drop policy if exists lineage_enrichment_runs_select on governance.lineage_enrichment_runs;
create policy lineage_enrichment_runs_select on governance.lineage_enrichment_runs
  for select to authenticated using (app_private.is_project_member(project_id));
revoke all on governance.lineage_enrichment_runs from anon,authenticated;
grant select on governance.lineage_enrichment_runs to authenticated;
grant all on governance.lineage_enrichment_runs to service_role;
comment on table governance.lineage_enrichment_runs is 'Durable, revision-bound outcome of technical/field lineage enrichment, including completeness and provider blockers.';

-- Keep the existing proven atomic ingestion implementation, then bind the just-ingested
-- provider observations to stable catalog identity inside the same transaction.
create or replace function governance.ingest_lineage_batch_atomic(
  p_project_id uuid,
  p_actor uuid,
  p_source_key text,
  p_source_name text,
  p_source_system text,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event jsonb;
  v_asset jsonb;
  v_event_id text;
  v_payload_hash text;
  v_existing record;
  v_source_key text := btrim(coalesce(p_source_key,''));
  v_source_system text := upper(btrim(coalesce(p_source_system,'')));
  v_result jsonb;
  v_source_id uuid;
  v_discovery_run_id uuid;
  v_catalog_revision_id uuid;
  v_namespace text;
  v_name text;
  v_asset_type text;
  v_full_name text;
  v_lineage_asset_id uuid;
  v_existing_bound_id uuid;
  v_catalog_asset record;
begin
  if jsonb_typeof(coalesce(p_events,'null'::jsonb)) <> 'array' or jsonb_array_length(p_events)=0 then
    raise exception 'events must be a non-empty JSON array';
  end if;

  if exists (
    select 1
    from (
      select btrim(coalesce(value->>'externalEventId','')) as external_event_id,
             count(distinct lower(btrim(coalesce(value->>'payloadHash','')))) as payload_hash_count
      from jsonb_array_elements(p_events)
      group by btrim(coalesce(value->>'externalEventId',''))
    ) d
    where d.external_event_id <> '' and d.payload_hash_count > 1
  ) then
    raise exception 'A lineage batch cannot contain the same externalEventId with different payload hashes';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event) <> 'object' then raise exception 'Each lineage event must be a JSON object'; end if;
    v_event_id := btrim(coalesce(v_event->>'externalEventId',''));
    v_payload_hash := lower(btrim(coalesce(v_event->>'payloadHash','')));
    if v_event_id='' then raise exception 'Each lineage event requires externalEventId'; end if;
    if v_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'Each lineage event requires a SHA-256 payloadHash'; end if;

    select e.payload_hash, i.source_key, i.integration_type
      into v_existing
    from governance.lineage_ingestion_events e
    left join governance.lineage_integrations i on i.id=e.integration_id
    where e.project_id=p_project_id and e.external_event_id=v_event_id;

    if found then
      if lower(btrim(v_existing.payload_hash)) <> v_payload_hash then
        raise exception 'Lineage replay payload mismatch for externalEventId %', v_event_id;
      end if;
      if btrim(coalesce(v_existing.source_key,'')) <> v_source_key
         or upper(btrim(coalesce(v_existing.integration_type,''))) <> v_source_system then
        raise exception 'Lineage replay source mismatch for externalEventId %', v_event_id;
      end if;
    end if;
  end loop;

  v_result := governance.ingest_lineage_batch_atomic_impl(
    p_project_id,p_actor,p_source_key,p_source_name,p_source_system,p_events
  );

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_event_id := btrim(coalesce(v_event->>'externalEventId',''));
    v_source_id := null;
    v_discovery_run_id := null;
    v_catalog_revision_id := null;
    begin
      if nullif(btrim(coalesce(v_event->>'dataSourceId','')),'') is not null then v_source_id := (v_event->>'dataSourceId')::uuid; end if;
      if nullif(btrim(coalesce(v_event->>'discoveryRunId','')),'') is not null then v_discovery_run_id := (v_event->>'discoveryRunId')::uuid; end if;
      if nullif(btrim(coalesce(v_event->>'catalogRevisionId','')),'') is not null then v_catalog_revision_id := (v_event->>'catalogRevisionId')::uuid; end if;
    exception when invalid_text_representation then
      raise exception 'Lineage event contains an invalid source/run/revision identifier for %', v_event_id;
    end;

    if v_source_id is not null and not exists(select 1 from catalog.data_sources where id=v_source_id and project_id=p_project_id) then
      raise exception 'Lineage event dataSourceId does not belong to the project for %', v_event_id;
    end if;
    if v_discovery_run_id is not null and not exists(select 1 from catalog.discovery_runs where id=v_discovery_run_id and project_id=p_project_id and source_id=v_source_id) then
      raise exception 'Lineage event discoveryRunId is not valid for the source for %', v_event_id;
    end if;
    if v_catalog_revision_id is not null and not exists(select 1 from catalog.catalog_revisions where id=v_catalog_revision_id and project_id=p_project_id and source_id=v_source_id) then
      raise exception 'Lineage event catalogRevisionId is not valid for the source for %', v_event_id;
    end if;

    update governance.lineage_ingestion_events
       set data_source_id=v_source_id,
           discovery_run_id=v_discovery_run_id,
           catalog_revision_id=v_catalog_revision_id
     where project_id=p_project_id and external_event_id=v_event_id;

    if v_source_id is null then continue; end if;

    for v_asset in
      select value from jsonb_array_elements(coalesce(v_event->'inputs','[]'::jsonb))
      union all
      select value from jsonb_array_elements(coalesce(v_event->'outputs','[]'::jsonb))
    loop
      v_namespace := btrim(coalesce(v_asset->>'namespace',''));
      v_name := btrim(coalesce(v_asset->>'name',''));
      v_asset_type := upper(btrim(coalesce(v_asset->>'assetType','DATASET')));
      v_full_name := btrim(coalesce(v_asset->'metadata'->>'databricks_full_name',case when v_namespace<>'' then v_namespace||'.'||v_name else v_name end));
      v_lineage_asset_id := null;
      select id into v_lineage_asset_id
        from governance.lineage_assets
       where project_id=p_project_id and namespace=v_namespace and name=v_name and asset_type=v_asset_type
       limit 1;
      if v_lineage_asset_id is null then continue; end if;

      v_catalog_asset := null;
      select da.id,da.identity_key,da.asset_key,da.asset_type,da.metadata
        into v_catalog_asset
        from catalog.discovered_assets da
       where da.source_id=v_source_id
         and da.is_current
         and (
           lower(da.asset_key)=lower(v_full_name)
           or lower(coalesce(da.metadata->>'native_qualified_name',''))=lower(v_full_name)
         )
       order by case when lower(coalesce(da.metadata->>'native_qualified_name',''))=lower(v_full_name) then 0 else 1 end
       limit 1;

      if v_catalog_asset.id is null or v_catalog_asset.identity_key is null then
        update governance.lineage_assets
           set data_source_id=v_source_id,
               catalog_revision_id=v_catalog_revision_id,
               identity_resolution='EXTERNAL_DEPENDENCY',
               identity_evidence=jsonb_build_object(
                 'full_name',v_full_name,
                 'authoritative_source',coalesce(v_asset->'metadata'->>'authoritative_source','DATABRICKS_SYSTEM_LINEAGE'),
                 'catalog_match',false
               ),
               last_seen_at=now()
         where id=v_lineage_asset_id;
        continue;
      end if;

      v_existing_bound_id := null;
      select id into v_existing_bound_id
        from governance.lineage_assets
       where data_source_id=v_source_id
         and catalog_identity_key=v_catalog_asset.identity_key
         and id<>v_lineage_asset_id
       order by first_seen_at,id
       limit 1;

      if v_existing_bound_id is not null then
        -- Move graph references to the stable canonical lineage node before removing the path duplicate.
        delete from governance.lineage_edges e
         where e.project_id=p_project_id and e.source_type='EXTERNAL_ASSET' and e.source_id=v_lineage_asset_id
           and exists(
             select 1 from governance.lineage_edges x
              where x.id<>e.id and x.project_id=e.project_id and x.source_type=e.source_type
                and x.source_id=v_existing_bound_id and x.target_type=e.target_type and x.target_id=e.target_id
                and x.relationship=e.relationship and x.transformation_id is not distinct from e.transformation_id
           );
        update governance.lineage_edges set source_id=v_existing_bound_id
         where project_id=p_project_id and source_type='EXTERNAL_ASSET' and source_id=v_lineage_asset_id;

        delete from governance.lineage_edges e
         where e.project_id=p_project_id and e.target_type='EXTERNAL_ASSET' and e.target_id=v_lineage_asset_id
           and exists(
             select 1 from governance.lineage_edges x
              where x.id<>e.id and x.project_id=e.project_id and x.target_type=e.target_type
                and x.target_id=v_existing_bound_id and x.source_type=e.source_type and x.source_id=e.source_id
                and x.relationship=e.relationship and x.transformation_id is not distinct from e.transformation_id
           );
        update governance.lineage_edges set target_id=v_existing_bound_id
         where project_id=p_project_id and target_type='EXTERNAL_ASSET' and target_id=v_lineage_asset_id;

        update governance.lineage_column_mappings set source_asset_id=v_existing_bound_id where source_asset_id=v_lineage_asset_id;
        update governance.lineage_column_mappings set target_asset_id=v_existing_bound_id where target_asset_id=v_lineage_asset_id;
        delete from governance.lineage_assets where id=v_lineage_asset_id;

        update governance.lineage_assets
           set namespace=v_namespace,
               name=v_name,
               asset_type=v_asset_type,
               data_source_id=v_source_id,
               catalog_identity_key=v_catalog_asset.identity_key,
               discovered_asset_id=v_catalog_asset.id,
               catalog_revision_id=v_catalog_revision_id,
               identity_resolution=case when v_catalog_asset.identity_key like 'native:%' then 'CATALOG_IDENTITY' else 'QUALIFIED_LOCATOR' end,
               identity_evidence=jsonb_build_object(
                 'full_name',v_full_name,
                 'catalog_asset_key',v_catalog_asset.asset_key,
                 'catalog_identity_key',v_catalog_asset.identity_key,
                 'authoritative_source',coalesce(v_asset->'metadata'->>'authoritative_source','DATABRICKS_SYSTEM_LINEAGE'),
                 'catalog_match',true
               ),
               metadata=metadata||jsonb_build_object('catalog_identity_key',v_catalog_asset.identity_key,'discovered_asset_id',v_catalog_asset.id),
               last_seen_at=now()
         where id=v_existing_bound_id;
      else
        update governance.lineage_assets
           set data_source_id=v_source_id,
               catalog_identity_key=v_catalog_asset.identity_key,
               discovered_asset_id=v_catalog_asset.id,
               catalog_revision_id=v_catalog_revision_id,
               identity_resolution=case when v_catalog_asset.identity_key like 'native:%' then 'CATALOG_IDENTITY' else 'QUALIFIED_LOCATOR' end,
               identity_evidence=jsonb_build_object(
                 'full_name',v_full_name,
                 'catalog_asset_key',v_catalog_asset.asset_key,
                 'catalog_identity_key',v_catalog_asset.identity_key,
                 'authoritative_source',coalesce(v_asset->'metadata'->>'authoritative_source','DATABRICKS_SYSTEM_LINEAGE'),
                 'catalog_match',true
               ),
               metadata=metadata||jsonb_build_object('catalog_identity_key',v_catalog_asset.identity_key,'discovered_asset_id',v_catalog_asset.id),
               last_seen_at=now()
         where id=v_lineage_asset_id;
      end if;
    end loop;
  end loop;

  return v_result || jsonb_build_object('catalogIdentityBinding',true,'catalogIdentityBindingVersion','v1');
end;
$function$;

revoke all on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) to service_role;
