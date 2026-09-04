create index if not exists lineage_edges_target_lookup_idx
  on governance.lineage_edges(project_id,target_type,target_id,created_at desc);

create index if not exists lineage_edges_source_lookup_idx
  on governance.lineage_edges(project_id,source_type,source_id,created_at desc);

create index if not exists lineage_column_mappings_source_field_idx
  on governance.lineage_column_mappings(project_id,source_asset_id,lower(source_column))
  where source_asset_id is not null and source_column is not null;

create index if not exists lineage_column_mappings_target_field_idx
  on governance.lineage_column_mappings(project_id,target_asset_id,lower(target_column))
  where target_asset_id is not null and target_column is not null;

create index if not exists lineage_assets_project_dataset_idx
  on governance.lineage_assets(project_id,dataset_id)
  where dataset_id is not null;
