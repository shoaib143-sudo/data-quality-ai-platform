-- Cover the remaining foreign-key paths in the catalog discovery control plane that
-- participate in scope versioning, manifest publication, revision chaining, JDBC
-- acceptance, or parent-side referential actions. Existing indexes whose leading
-- columns already cover an FK are intentionally not duplicated.

create index if not exists catalog_revisions_manifest_fk_idx
  on catalog.catalog_revisions (manifest_id);
create index if not exists catalog_revisions_previous_revision_fk_idx
  on catalog.catalog_revisions (previous_revision_id);
create index if not exists catalog_revisions_project_fk_idx
  on catalog.catalog_revisions (project_id);
create index if not exists catalog_revisions_scope_version_fk_idx
  on catalog.catalog_revisions (scope_version_id);

create index if not exists discovery_manifests_project_fk_idx
  on catalog.discovery_manifests (project_id);
create index if not exists discovery_manifests_scope_fk_idx
  on catalog.discovery_manifests (scope_id);
create index if not exists discovery_manifests_scope_version_fk_idx
  on catalog.discovery_manifests (scope_version_id);
create index if not exists discovery_manifests_source_fk_idx
  on catalog.discovery_manifests (source_id);

create index if not exists discovery_runs_catalog_revision_fk_idx
  on catalog.discovery_runs (catalog_revision_id);
create index if not exists discovery_runs_manifest_fk_idx
  on catalog.discovery_runs (manifest_id);
create index if not exists discovery_runs_scope_fk_idx
  on catalog.discovery_runs (scope_id);
create index if not exists discovery_runs_scope_version_fk_idx
  on catalog.discovery_runs (scope_version_id);

create index if not exists source_scope_versions_project_fk_idx
  on catalog.source_scope_versions (project_id);

create index if not exists source_scopes_current_version_fk_idx
  on catalog.source_scopes (current_version_id);
create index if not exists source_scopes_project_fk_idx
  on catalog.source_scopes (project_id);
