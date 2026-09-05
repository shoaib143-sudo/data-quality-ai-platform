import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const failures = []
function requireContract(name, source, pattern, message) {
  if (!pattern.test(source)) failures.push(`${name}: ${message}`)
}
function rejectContract(name, source, pattern, message) {
  if (pattern.test(source)) failures.push(`${name}: ${message}`)
}

const form = read('app/datasets/jdbc-source-form.tsx')
const registration = read('app/api/datasets/source/register/route.ts')
const discoveryApi = read('app/api/datasets/source/discover/route.ts')
const discovery = read('app/catalog/discovery/discovery-manager.tsx')
const nativeConnector = read('supabase/functions/dgp-native-hierarchy-connector/index.ts')
const durableDiscovery = read('lib/catalog/discovery.ts')
const nativeJdbcDiscovery = read('lib/catalog/native-jdbc-discovery.ts')

requireContract('connect-first', form, /Connect & discover native hierarchy/, 'Databricks must connect before asking the user to select metadata scope.')
requireContract('hierarchy-picker', form, /NativeHierarchyPicker/, 'Databricks must render the hierarchy returned by Unity Catalog.')
requireContract('save-scope', form, /Save connection & scope/, 'Databricks must save a governed connection and its discovered scope.')
requireContract('connection-only', form, /connectionOnly:\s*!isFile/, 'Database UI must save a governed connection rather than forcing a single table activation.')
requireContract('selection-payload', form, /hierarchySelection:/, 'Databricks registration request must carry the native hierarchy selection.')
rejectContract('no-preselected-catalog', form, /field\(\s*['"]Catalog['"]\s*,\s*catalog/, 'Databricks onboarding must not force a catalog before first connectivity.')

requireContract('hierarchy-api', discoveryApi, /discoverNativeHierarchy/, 'First connectivity must discover accessible Databricks hierarchy from the source.')
requireContract('uc-catalogs', nativeConnector, /unity-catalog\/catalogs/, 'Databricks native hierarchy must begin with accessible Unity Catalog catalogs.')
requireContract('uc-schemas', nativeConnector, /unity-catalog\/schemas\?catalog_name=/, 'Databricks hierarchy must discover schemas beneath each catalog.')
requireContract('uc-objects', nativeConnector, /unity-catalog\/tables\?catalog_name=/, 'Databricks hierarchy must discover objects beneath each schema.')
requireContract('uc-fields', nativeConnector, /tableRow\.columns|detail\.columns/, 'Databricks hierarchy must expose fields from Unity Catalog object metadata.')

requireContract('parse-connection-only', registration, /const\s+connectionOnly\s*=\s*body\.connectionOnly\s*===\s*true/, 'Registration API must explicitly parse connectionOnly.')
requireContract('registration-boundary', registration, /sourceType\s*===\s*['"]JDBC['"]\s*&&\s*connectionOnly/, 'Registration API must have a JDBC connection-only boundary.')
requireContract('persist-selection', registration, /hierarchy_selection:\s*selection/, 'Registration must persist the native hierarchy selection.')
requireContract('configured-state', registration, /status:\s*['"]CONFIGURED['"]/, 'Connection-only registration must persist CONFIGURED state.')
requireContract('saved-result', registration, /connection_saved:\s*true/, 'Connection-only registration must return an explicit saved-connection result.')

requireContract('durable-native-scope', durableDiscovery, /metadata\.hierarchy_selection[\s\S]{0,300}discoverJdbcFromNativeHierarchy\(metadata\)/, 'Durable discovery must consume the saved native hierarchy scope.')
requireContract('databricks-lineage', nativeJdbcDiscovery, /engine\s*===\s*['"]DATABRICKS['"]/, 'Databricks discovery must retain authoritative lineage discovery for selected objects.')
requireContract('field-selection', nativeJdbcDiscovery, /selectedFieldNamesForObject/, 'Databricks discovery must honor field-level selections.')
requireContract('legacy-compatibility', read('lib/connectors/schema-scope.ts'), /schema_scope|schemaScope/, 'Legacy Databricks schema-scoped connections must remain readable for backward compatibility.')

requireContract('live-polling', discovery, /window\.setInterval\(\(\)\s*=>\s*router\.refresh\(\),\s*2000\)/, 'Catalog Discovery UI must continuously refresh durable discovery progress.')
requireContract('terminal-polling', discovery, /matchingRun\.completed_at\s*\|\|\s*matchingRun\.error_message/, 'Catalog Discovery UI must stop polling on a terminal run result.')
requireContract('monitoring-state', discovery, /Monitoring discovery/, 'Catalog Discovery UI must expose a visible monitoring state.')
requireContract('edit-preserves-source', read('app/datasets/edit/[sourceId]/page.tsx'), /initialSource\s*=/, 'Databricks editing must preserve its existing source and credential reference.')
requireContract('catalog-discovery-link', read('app/catalog/page.tsx'), /href=["']\/catalog\/discovery["']/, 'Catalog must link to Discovery.')

if (failures.length) throw new Error(`Databricks native hierarchy flow verification failed:\n- ${failures.join('\n- ')}`)
console.log('Databricks native hierarchy Web UI flow contracts verified.')
