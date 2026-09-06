import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906153000_harden_catalog_reconciliation_fk_indexes.sql', 'utf8')

const requiredIndexes = [
  ['asset_identity_evidence_project_fk_idx', 'catalog.asset_identity_evidence (project_id)'],
  ['asset_identity_evidence_first_seen_revision_fk_idx', 'catalog.asset_identity_evidence (first_seen_revision_id)'],
  ['asset_identity_evidence_last_seen_revision_fk_idx', 'catalog.asset_identity_evidence (last_seen_revision_id)'],
  ['asset_locator_history_project_fk_idx', 'catalog.asset_locator_history (project_id)'],
  ['asset_locator_history_valid_from_revision_fk_idx', 'catalog.asset_locator_history (valid_from_revision_id)'],
  ['asset_locator_history_valid_to_revision_fk_idx', 'catalog.asset_locator_history (valid_to_revision_id)'],
  ['catalog_change_events_project_fk_idx', 'catalog.catalog_change_events (project_id)'],
  ['catalog_change_events_source_fk_idx', 'catalog.catalog_change_events (source_id)'],
  ['catalog_change_events_previous_asset_fk_idx', 'catalog.catalog_change_events (previous_asset_id)'],
  ['catalog_change_events_current_asset_fk_idx', 'catalog.catalog_change_events (current_asset_id)'],
  ['discovered_assets_last_seen_run_fk_idx', 'catalog.discovered_assets (last_seen_run_id)'],
  ['scope_asset_state_project_fk_idx', 'catalog.scope_asset_state (project_id)'],
  ['scope_asset_state_discovered_asset_fk_idx', 'catalog.scope_asset_state (discovered_asset_id)'],
  ['scope_asset_state_first_seen_revision_fk_idx', 'catalog.scope_asset_state (first_seen_revision_id)'],
  ['scope_asset_state_last_seen_revision_fk_idx', 'catalog.scope_asset_state (last_seen_revision_id)'],
  ['scope_asset_state_missing_since_revision_fk_idx', 'catalog.scope_asset_state (missing_since_revision_id)'],
  ['source_annotation_versions_last_seen_run_fk_idx', 'catalog.source_annotation_versions (last_seen_run_id)'],
]

for (const [name, target] of requiredIndexes) {
  if (!migration.includes(`create index if not exists ${name}`)) throw new Error(`Missing catalog reconciliation index: ${name}`)
  if (!migration.includes(`on ${target}`)) throw new Error(`Catalog reconciliation index ${name} does not cover expected FK target ${target}`)
}

for (const forbidden of [/drop\s+index/i, /drop\s+table/i, /alter\s+table[\s\S]*drop/i, /create\s+unique\s+index/i]) {
  if (forbidden.test(migration)) throw new Error(`Catalog reconciliation index migration contains destructive or authority-changing SQL: ${forbidden}`)
}

console.log(`Catalog reconciliation FK index hardening verified: ${requiredIndexes.length} targeted covering indexes.`)
