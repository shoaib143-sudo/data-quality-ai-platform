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
const registration = read('app/api/datasets/source/register/route.ts')
const discoveryApi = read('app/api/datasets/source/discover/route.ts')
const discovery = read('app/catalog/discovery/discovery-manager.tsx')
const nativeConnector = read('supabase/functions/dgp-native-hierarchy-connector/index.ts')

requireContract(form, /Connect & discover native hierarchy/, 'Databricks must connect before asking the user to select metadata scope.')
requireContract(form, /NativeHierarchyPicker/, 'Databricks must render the hierarchy returned by Unity Catalog.')
requireContract(form, /Save connection & scope/, 'Databricks must save a governed connection and its discovered scope.')
requireContract(form, /connectionOnly:\s*!isFile/, 'Database UI must save a governed connection rather than forcing a single table activation.')
requireContract(form, /hierarchySelection:/, 'Databricks registration request must carry the native hierarchy selection.')
rejectContract(form, /field\('Catalog',\s*catalog/, 'Databricks onboarding must not force a catalog before first connectivity.')

requireContract(discoveryApi, /discoverNativeHierarchy/, 'First connectivity must discover accessible Databricks hierarchy from the source.')
requireContract(nativeConnector, /unity-catalog\/catalogs/, 'Databricks native hierarchy must begin with accessible Unity Catalog catalogs.')
requireContract(nativeConnector, /unity-catalog\/schemas\?catalog_name=/, 'Databricks hierarchy must discover schemas beneath each catalog.')
requireContract(nativeConnector, /unity-catalog\/tables\?catalog_name=/, 'Databricks hierarchy must discover objects beneath each schema.')
requireContract(nativeConnector, /columns/, 'Databricks hierarchy must expose fields from Unity Catalog object metadata.')

requireContract(registration, /const connectionOnly = body\.connectionOnly === true/, 'Registration API must explicitly parse connectionOnly.')
requireContract(registration, /sourceType === 'JDBC' && connectionOnly/, 'Registration API must have a JDBC connection-only boundary.')
requireContract(registration, /hierarchy_selection:/, 'Registration must persist the native hierarchy selection.')
requireContract(registration, /status: 'CONFIGURED'/, 'Connection-only registration must persist CONFIGURED state.')
requireContract(registration, /connection_saved: true/, 'Connection-only registration must return an explicit saved-connection result.')

requireContract(read('lib/catalog/discovery.ts'), /metadata\.hierarchy_selection[\s\S]*discoverJdbcFromNativeHierarchy/, 'Durable discovery must consume the saved native hierarchy scope.')
requireContract(read('lib/catalog/native-jdbc-discovery.ts'), /engine === 'DATABRICKS'/, 'Databricks discovery must retain authoritative lineage discovery for selected objects.')
requireContract(read('lib/catalog/native-jdbc-discovery.ts'), /selectedFieldNamesForObject/, 'Databricks discovery must honor field-level selections.')
requireContract(read('lib/connectors/schema-scope.ts'), /schema_scope|schemaScope/, 'Legacy Databricks schema-scoped connections must remain readable for backward compatibility.')

requireContract(discovery, /window\.setInterval\(\(\)=>router\.refresh\(\),2000\)/, 'Catalog Discovery UI must continuously refresh durable discovery progress.')
requireContract(discovery, /matchingRun\.completed_at\|\|matchingRun\.error_message/, 'Catalog Discovery UI must stop polling on a terminal run result.')
requireContract(discovery, /Monitoring discovery/, 'Catalog Discovery UI must expose a visible monitoring state.')
requireContract(read('app/datasets/edit/[sourceId]/page.tsx'), /initialSource=/, 'Databricks editing must preserve its existing source and credential reference.')
requireContract(read('app/catalog/page.tsx'), /href="\/catalog\/discovery"/, 'Catalog must link to Discovery.')

console.log('Databricks native hierarchy Web UI flow contracts verified.')
