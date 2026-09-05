import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireContract(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}

const form = read('app/datasets/jdbc-source-form.tsx')
const registration = read('app/api/datasets/source/register/route.ts')
const discovery = read('app/catalog/discovery/discovery-manager.tsx')

requireContract(form, /connectionKind === 'databricks'[^\n]*'Save connection'/, 'Databricks must expose an explicit Save connection action.')
requireContract(form, /const connectionOnly = connectionKind === 'databricks'/, 'Databricks UI must save a governed connection instead of forcing table activation.')
requireContract(form, /catalog: connectionOnly \? catalog : undefined/, 'Databricks connection save must persist the selected Unity Catalog catalog.')
requireContract(form, /credentialRef: ref, connectionOnly \}\)/, 'Databricks registration request must carry connectionOnly to the server boundary.')
requireContract(form, /Test connection & discover/, 'Databricks UI must preserve the production connection test and discovery action.')

requireContract(registration, /const connectionOnly = body\.connectionOnly === true/, 'Registration API must explicitly parse connectionOnly.')
requireContract(registration, /sourceType === 'JDBC' && connectionOnly/, 'Registration API must have a JDBC connection-only boundary.')
requireContract(registration, /status: 'CONFIGURED'/, 'Connection-only registration must persist CONFIGURED state.')
requireContract(registration, /connection_saved: true/, 'Connection-only registration must return an explicit saved-connection result.')

requireContract(discovery, /window\.setInterval\(\(\)=>router\.refresh\(\),2000\)/, 'Catalog Discovery UI must continuously refresh durable discovery progress.')
requireContract(discovery, /matchingRun\.completed_at\|\|matchingRun\.error_message/, 'Catalog Discovery UI must stop polling on a terminal run result.')
requireContract(discovery, /Monitoring discovery/, 'Catalog Discovery UI must expose a visible monitoring state.')

requireContract(form, /schemas: connectionOnly \? selectedSchemas : undefined/, 'Databricks connection saves must carry the selected schema array.')
requireContract(form, /Select schemas/, 'Databricks must offer multiple schema selection.')
requireContract(form, /All data schemas/, 'Databricks must offer catalog-wide data schema discovery.')
requireContract(registration, /connectionMetadata\.schema_scope = scope\.schemaScope/, 'Registration must persist an explicit schema scope.')
requireContract(read('lib/catalog/discovery.ts'), /discoverDatabricksSchemaScope/, 'Durable discovery must consume the saved schema scope.')
requireContract(read('app/datasets/edit/[sourceId]/page.tsx'), /initialSource=/, 'Databricks editing must preserve its existing source and credential reference.')
requireContract(read('app/catalog/page.tsx'), /href="\/catalog\/discovery"/, 'Catalog must link to Discovery.')
console.log('Databricks Web UI flow contracts verified.')
