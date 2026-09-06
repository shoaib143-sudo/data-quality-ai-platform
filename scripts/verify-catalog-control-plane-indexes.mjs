import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906153500_harden_catalog_control_plane_fk_indexes.sql', 'utf8')

const requiredIndexes = [
  ['catalog_revisions_manifest_fk_idx', 'catalog.catalog_revisions (manifest_id)'],
  ['catalog_revisions_previous_revision_fk_idx', 'catalog.catalog_revisions (previous_revision_id)'],
  ['catalog_revisions_project_fk_idx', 'catalog.catalog_revisions (project_id)'],
  ['catalog_revisions_scope_version_fk_idx', 'catalog.catalog_revisions (scope_version_id)'],
  ['discovery_manifests_project_fk_idx', 'catalog.discovery_manifests (project_id)'],
  ['discovery_manifests_scope_fk_idx', 'catalog.discovery_manifests (scope_id)'],
  ['discovery_manifests_scope_version_fk_idx', 'catalog.discovery_manifests (scope_version_id)'],
  ['discovery_manifests_source_fk_idx', 'catalog.discovery_manifests (source_id)'],
  ['discovery_runs_catalog_revision_fk_idx', 'catalog.discovery_runs (catalog_revision_id)'],
  ['discovery_runs_manifest_fk_idx', 'catalog.discovery_runs (manifest_id)'],
  ['discovery_runs_scope_fk_idx', 'catalog.discovery_runs (scope_id)'],
  ['discovery_runs_scope_version_fk_idx', 'catalog.discovery_runs (scope_version_id)'],
  ['source_scope_versions_project_fk_idx', 'catalog.source_scope_versions (project_id)'],
  ['source_scopes_current_version_fk_idx', 'catalog.source_scopes (current_version_id)'],
  ['source_scopes_project_fk_idx', 'catalog.source_scopes (project_id)'],
]

for (const [name, target] of requiredIndexes) {
  if (!migration.includes(`create index if not exists ${name}`)) throw new Error(`Missing catalog control-plane index: ${name}`)
  if (!migration.includes(`on ${target}`)) throw new Error(`Catalog control-plane index ${name} does not cover expected FK target ${target}`)
}

for (const forbidden of [/drop\s+index/i, /drop\s+table/i, /alter\s+table[\s\S]*drop/i, /create\s+unique\s+index/i]) {
  if (forbidden.test(migration)) throw new Error(`Catalog control-plane index migration contains destructive or authority-changing SQL: ${forbidden}`)
}

console.log(`Catalog control-plane FK index hardening verified: ${requiredIndexes.length} targeted covering indexes.`)
