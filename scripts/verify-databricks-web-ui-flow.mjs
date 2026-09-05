import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}
function requireContract(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}
function rejectContract(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message)
}

const form = read('app/datasets/jdbc-source-form.tsx')
const discoveryApi = read('app/api/datasets/source/discover/route.ts')
const registration = read('app/api/datasets/source/register/route.ts')
const nativeConnector = read('supabase/functions/dgp-native-hierarchy-connector/index.ts')
const durableDiscovery = read('lib/catalog/discovery.ts')
const nativeJdbcDiscovery = read('lib/catalog/native-jdbc-discovery.ts')
const lineageEnrichment = read('lib/catalog/lineage-enrichment.ts')
const durableWorker = read('lib/orchestration/worker.ts')

requireContract(form, /Connect & discover native hierarchy/, 'Databricks must connect before metadata scope selection.')
requireContract(form, /NativeHierarchyPicker/, 'Databricks must render the provider-native hierarchy.')
requireContract(form, /hierarchySelection:/, 'Databricks save must carry native hierarchy selection.')
requireContract(form, /connectionOnly:\s*!isFile/, 'Database onboarding must save a connection rather than force one table.')
rejectContract(form, /field\(\s*['"]Catalog['"]\s*,/, 'Databricks must not require a catalog before initial connectivity.')

requireContract(discoveryApi, /discoverNativeHierarchy/, 'Initial database connectivity must discover the native hierarchy.')
requireContract(nativeConnector, /unity-catalog\/catalogs/, 'Databricks hierarchy must discover accessible catalogs.')
requireContract(nativeConnector, /unity-catalog\/schemas\?catalog_name=/, 'Databricks hierarchy must discover schemas under catalogs.')
requireContract(nativeConnector, /unity-catalog\/tables\?catalog_name=/, 'Databricks hierarchy must discover objects under schemas.')
requireContract(nativeConnector, /tableRow\.columns|detail\.columns/, 'Databricks hierarchy must expose native fields.')

requireContract(registration, /hierarchy_selection:\s*selection/, 'Native hierarchy selection must be persisted with the connection.')
requireContract(registration, /status:\s*['"]CONFIGURED['"]/, 'Database connections must remain CONFIGURED until durable discovery.')
requireContract(durableDiscovery, /hierarchy_selection/, 'Durable discovery must recognize native hierarchy scope.')
requireContract(durableDiscovery, /discoverJdbcFromNativeHierarchy\(frozenMetadata,\s*checkpointAdapter\(runId\)\)/, 'Durable discovery must execute the frozen native hierarchy scope with resumable checkpoints.')
requireContract(durableDiscovery, /ensure_source_scope_version/, 'Durable discovery must freeze scope identity before scanning.')
requireContract(durableDiscovery, /publish_discovery_revision/, 'Durable discovery must publish complete scans atomically.')
requireContract(nativeJdbcDiscovery, /selectedObjectNodes/, 'Native discovery must honor object-level selection.')
requireContract(nativeJdbcDiscovery, /metadata_discovery_field_scope:\s*'FULL_OBJECT'/, 'Included physical objects must retain complete field definitions.')
requireContract(durableDiscovery, /jobType:\s*'LINEAGE_ENRICHMENT'/, 'Lineage must run after physical catalog publication rather than block it.')
requireContract(durableWorker, /job\.job_type === 'LINEAGE_ENRICHMENT'/, 'Durable worker must process lineage enrichment jobs.')
requireContract(lineageEnrichment, /authoritative_source:\s*'system\.access\.column_lineage'/, 'Databricks field lineage must retain authoritative system.access.column_lineage provenance.')
requireContract(lineageEnrichment, /ingest_lineage_batch_atomic/, 'Databricks authoritative lineage must use governed atomic ingestion.')
requireContract(read('lib/connectors/schema-scope.ts'), /schema_scope|schemaScope/, 'Legacy schema-scoped Databricks sources must remain backward compatible.')

console.log('Databricks native hierarchy Web UI flow contracts verified.')
