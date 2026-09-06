-- Cover the remaining populated catalog source-level control tables where project
-- foreign keys participate in parent-side ON DELETE CASCADE checks. Source-id
-- foreign keys are already covered by each table's primary key and are not duplicated.

create index if not exists source_deletion_policies_project_fk_idx
  on catalog.source_deletion_policies (project_id);

create index if not exists source_discovery_capabilities_project_fk_idx
  on catalog.source_discovery_capabilities (project_id);
