import fs from 'node:fs'
import assert from 'node:assert/strict'

function read(path) { return fs.readFileSync(path, 'utf8') }
function contains(path, pattern, message) {
  const text = read(path)
  assert.match(text, pattern, `${message} (${path})`)
}
function excludes(path, pattern, message) {
  const text = read(path)
  assert.doesNotMatch(text, pattern, `${message} (${path})`)
}

contains('lib/connectors/native-hierarchy.ts', /NativeHierarchyNodeKind[\s\S]*CATALOG[\s\S]*DATABASE[\s\S]*SCHEMA[\s\S]*OBJECT[\s\S]*FIELD/, 'Native hierarchy contract must preserve provider hierarchy levels')
contains('lib/connectors/native-hierarchy.ts', /qualifiedName:\s*string/, 'Native hierarchy nodes must persist provider-qualified identities')
contains('lib/connectors/native-hierarchy.ts', /mode:\s*'ALL'\s*\|\s*'SELECTED'/, 'Hierarchy selection must support all and selected scopes')

contains('app/api/datasets/source/discover/route.ts', /discoverNativeHierarchy/, 'First connectivity must discover the native hierarchy')
contains('app/api/datasets/source/register/route.ts', /hierarchy_selection/, 'Connection persistence must save native hierarchy scope')
contains('app/api/datasets/source/register/route.ts', /discoverNativeHierarchy/, 'Server must revalidate the native hierarchy during save')
contains('lib/catalog/discovery.ts', /metadata\.hierarchy_selection[\s\S]*discoverJdbcFromNativeHierarchy/, 'Catalog Discovery must honor saved native hierarchy scope')
contains('lib/catalog/native-jdbc-discovery.ts', /selectedObjectNodes/, 'Native discovery must resolve selected objects from the hierarchy')
contains('lib/catalog/native-jdbc-discovery.ts', /selectedFieldNamesForObject/, 'Native discovery must honor field-level selections')
contains('lib/catalog/native-jdbc-discovery.ts', /discoverJdbcTransformations/, 'Native object discovery must retain connector lineage discovery')

contains('app/datasets/jdbc-source-form.tsx', /Connect & discover native hierarchy/, 'Database onboarding must connect before hierarchy selection')
contains('app/datasets/jdbc-source-form.tsx', /NativeHierarchyPicker/, 'Database onboarding must render the native hierarchy tree')
contains('app/datasets/native-hierarchy-picker.tsx', /Select from hierarchy/, 'Hierarchy UI must support explicit multi-node selection')
contains('app/datasets/native-hierarchy-picker.tsx', /catalogs\/databases, schemas, objects, or fields/, 'Hierarchy UI must expose multi-level source-native selection')
excludes('app/datasets/jdbc-source-form.tsx', /field\('Catalog',\s*catalog/, 'Databricks onboarding must not force a user-supplied catalog before discovery')

contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getCatalogs\(\)/, 'Generic JDBC hierarchy must ask the driver for catalogs')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getSchemas\(/, 'Generic JDBC hierarchy must ask the driver for schemas')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getTables\(/, 'Generic JDBC hierarchy must ask the driver for native objects')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getColumns\(/, 'Generic JDBC hierarchy must ask the driver for fields')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getCatalogTerm\(\)/, 'Generic JDBC hierarchy must preserve driver catalog terminology')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java', /getSchemaTerm\(\)/, 'Generic JDBC hierarchy must preserve driver schema terminology')
contains('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcBridgeController.java', /validateOptionalIdentifier\(request\.schema\(\), "schema"\)/, 'JDBC validation/query/lineage must permit catalog-only native namespaces')

contains('supabase/functions/dgp-native-hierarchy-connector/index.ts', /unity-catalog\/catalogs/, 'Databricks hierarchy discovery must begin from accessible catalogs')
contains('supabase/functions/dgp-native-hierarchy-connector/index.ts', /pg_namespace/, 'PostgreSQL hierarchy must use native namespaces')
contains('supabase/functions/dgp-native-hierarchy-connector/index.ts', /pg_class/, 'PostgreSQL hierarchy must preserve native object types')
contains('supabase/functions/dgp-native-hierarchy-connector/index.ts', /pg_attribute/, 'PostgreSQL hierarchy must preserve native fields')

for (const path of [
  'app/api/datasets/source/register/route.ts',
  'lib/connectors/native-hierarchy-discovery.ts',
  'supabase/functions/dgp-native-hierarchy-connector/index.ts',
]) {
  excludes(path, /connection_metadata[^\n]*(password|access_token|client_secret)/i, 'Connector metadata must not persist raw credentials')
}

console.log('Provider-native hierarchy connector contracts verified.')
