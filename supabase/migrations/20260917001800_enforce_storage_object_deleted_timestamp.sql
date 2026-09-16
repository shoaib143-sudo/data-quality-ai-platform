alter table catalog.storage_objects
  drop constraint if exists storage_objects_deleted_requires_timestamp;

alter table catalog.storage_objects
  add constraint storage_objects_deleted_requires_timestamp
  check (state <> 'DELETED' or deleted_at is not null);
