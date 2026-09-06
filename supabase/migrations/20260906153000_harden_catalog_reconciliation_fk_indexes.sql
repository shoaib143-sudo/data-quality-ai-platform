-- Index only the populated metadata discovery/reconciliation tables where FK columns
-- participate in version history, revision linkage, current-state reconciliation, or
-- parent-side referential actions. This intentionally does not attempt to clear every
-- performance advisor INFO and does not remove indexes reported as unused.

create index if not exists asset_identity_evidence_project_fk_idx
  on catalog.asset_identity_evidence (project_id);
create index if not exists asset_identity_evidence_first_seen_revision_fk_idx
  on catalog.asset_identity_evidence (first_seen_revision_id);
create index if not exists asset_identity_evidence_last_seen_revision_fk_idx
  on catalog.asset_identity_evidence (last_seen_revision_id);

create index if not exists asset_locator_history_project_fk_idx
  on catalog.asset_locator_history (project_id);
create index if not exists asset_locator_history_valid_from_revision_fk_idx
  on catalog.asset_locator_history (valid_from_revision_id);
create index if not exists asset_locator_history_valid_to_revision_fk_idx
  on catalog.asset_locator_history (valid_to_revision_id);

create index if not exists catalog_change_events_project_fk_idx
  on catalog.catalog_change_events (project_id);
create index if not exists catalog_change_events_source_fk_idx
  on catalog.catalog_change_events (source_id);
create index if not exists catalog_change_events_previous_asset_fk_idx
  on catalog.catalog_change_events (previous_asset_id);
create index if not exists catalog_change_events_current_asset_fk_idx
  on catalog.catalog_change_events (current_asset_id);

create index if not exists discovered_assets_last_seen_run_fk_idx
  on catalog.discovered_assets (last_seen_run_id);

create index if not exists scope_asset_state_project_fk_idx
  on catalog.scope_asset_state (project_id);
create index if not exists scope_asset_state_discovered_asset_fk_idx
  on catalog.scope_asset_state (discovered_asset_id);
create index if not exists scope_asset_state_first_seen_revision_fk_idx
  on catalog.scope_asset_state (first_seen_revision_id);
create index if not exists scope_asset_state_last_seen_revision_fk_idx
  on catalog.scope_asset_state (last_seen_revision_id);
create index if not exists scope_asset_state_missing_since_revision_fk_idx
  on catalog.scope_asset_state (missing_since_revision_id);

create index if not exists source_annotation_versions_last_seen_run_fk_idx
  on catalog.source_annotation_versions (last_seen_run_id);
