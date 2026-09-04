create index if not exists governance_documents_dataset_idx
  on governance.documents(dataset_id);

create index if not exists governance_documents_dataset_version_idx
  on governance.documents(dataset_version_id);

select pg_notify('pgrst','reload schema');
