create index if not exists cde_mappings_reviewed_by_idx
  on governance.cde_mappings(reviewed_by)
  where reviewed_by is not null;

create index if not exists dataset_classifications_reviewed_by_idx
  on governance.dataset_classifications(reviewed_by)
  where reviewed_by is not null;

create index if not exists certification_readiness_dataset_fk_idx
  on governance.certification_readiness(dataset_id);
