import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906090000_harden_lineage_identity_and_runs.sql', 'utf8')
const connector = fs.readFileSync('supabase/functions/dgp-databricks-connector/index.ts', 'utf8')
const enrichment = fs.readFileSync('lib/catalog/lineage-enrichment.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Lineage source-identity contract missing: ${label}`)
}
function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Lineage source-identity contract missing: ${label}`)
}

for (const column of ['data_source_id','catalog_identity_key','discovered_asset_id','catalog_revision_id','identity_resolution','identity_evidence']) {
  requireText(migration, column, `lineage asset ${column}`)
}
requireText(migration, 'lineage_assets_one_catalog_identity', 'one canonical lineage node per source catalog identity')
requireText(migration, 'governance.lineage_enrichment_runs', 'durable revision-bound enrichment outcome')
requireText(migration, "'BLOCKED'", 'blocked provider outcome')
requireText(migration, "'CATALOG_IDENTITY'", 'stable catalog identity resolution')
requireText(migration, "'EXTERNAL_DEPENDENCY'", 'truthful outside-catalog dependency resolution')
requireText(migration, "v_result := governance.ingest_lineage_batch_atomic_impl", 'existing atomic ingestion remains the transaction core')
requireText(migration, "catalogIdentityBindingVersion','v1'", 'atomic catalog binding evidence')
requirePattern(migration, /lower\(da\.asset_key\)=lower\(v_full_name\)[\s\S]*native_qualified_name/, 'catalog binding uses exact source-qualified locator evidence')
requirePattern(migration, /update governance\.lineage_column_mappings set source_asset_id=v_existing_bound_id[\s\S]*delete from governance\.lineage_assets/, 'rename/move path duplicates collapse onto stable identity')

requireText(connector, '"lineage_scope"', 'scoped Databricks lineage connector action')
requireText(connector, 'system.access.column_lineage', 'authoritative Databricks column lineage source')
requireText(connector, 'system.access.table_lineage', 'authoritative Databricks table lineage source')
requireText(connector, 'query_count: 2', 'constant-query scoped lineage extraction')
requireText(connector, 'selected_catalogs: catalogs', 'provider-native catalog scope evidence')
requirePattern(connector, /rowLimit = TECHNICAL_MAX_ROWS \+ 1[\s\S]*truncated/, 'lineage extraction detects safety-ceiling truncation')

requireText(enrichment, "action: 'lineage_scope'", 'Databricks enrichment uses scoped extraction')
requirePattern(enrichment, /if \(engine === 'DATABRICKS'\)[\s\S]*discoverDatabricksScopedLineage/, 'Databricks avoids per-object system.access calls')
requirePattern(enrichment, /else \{[\s\S]*lineageTargets[\s\S]*discoverJdbcTransformations/, 'non-Databricks view discovery remains isolated')
requireText(enrichment, "['system.access.column_lineage', 'system.access.table_lineage']", 'only authoritative Databricks system lineage is promoted')
requireText(enrichment, 'dataSourceId: source.id', 'lineage events carry source identity')
requireText(enrichment, 'catalogRevisionId: context.catalogRevisionId', 'lineage events carry catalog revision identity')
requireText(enrichment, 'beginLineageRun', 'durable lineage execution evidence starts before provider work')
requireText(enrichment, 'finishLineageRun', 'durable lineage execution evidence closes with outcome')
requireText(enrichment, 'DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED', 'exact external permission blocker code')
if (/engine === 'DATABRICKS' \? 12/.test(enrichment)) throw new Error('Lineage source-identity contract missing: serialized/per-object Databricks fan-out remains enabled')

console.log('Lineage scoped extraction, catalog identity binding, and durable evidence contracts verified.')
