create index if not exists idx_storage_objects_created_by
  on catalog.storage_objects(created_by)
  where created_by is not null;
