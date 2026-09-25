import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/lineage-authority-integrity.yml', 'utf8')
const runner = readFileSync('scripts/run-real-field-lineage-revalidation.mjs', 'utf8')
const databricksRunner = readFileSync('scripts/run-databricks-field-lineage-revalidation.mjs', 'utf8')

test('live lineage mutation never runs for pull_request', () => {
  assert.match(workflow, /live-real-field-lineage:\n\s+if: github\.event_name != 'pull_request'/)
})

test('live lineage proof uses the existing protected Supabase service-role secret', () => {
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/)
  assert.doesNotMatch(workflow, /DATANEXUS_VERCEL|CLOUDFLARE|R2/i)
})

test('runner requires source-observed pg_views field mappings and atomic governed ingestion', () => {
  assert.match(runner, /pg_views\.definition/)
  assert.match(runner, /No proven direct field mappings were derived/)
  assert.match(runner, /ingest_lineage_batch_atomic/)
  assert.match(runner, /audit_atomic/)
  assert.match(runner, /database_capability_verified/)
})

test('runner closes only when the formal field-lineage verifier passes', () => {
  assert.match(runner, /verify_ai_governance_intelligence/)
  assert.match(runner, /fieldLineage\.status !== 'PASS'/)
  assert.match(runner, /verify_lineage_authority_posture/)
})

test('controlled live target is the genuine PostgreSQL governance view', () => {
  assert.match(workflow, /LINEAGE_TARGET_VIEW: glossary_reference_concepts/)
  assert.match(workflow, /LINEAGE_TARGET_SCHEMA: governance/)
})

test('live mutation is scoped by changed lineage files or explicit dispatch', () => {
  assert.match(workflow, /id: scope/)
  assert.match(workflow, /if \[ \"\$EVENT_NAME\" = \"workflow_dispatch\" \]; then/)
  assert.match(workflow, /run_live=true/)
})


test('connector file changes trigger the live lineage proof scope', () => {
  assert.match(workflow, /supabase\/functions\/dgp-postgres-connector\/\.\*/)
})


test('runner uses the modern secret-key service channel and avoids opaque bearer auth', () => {
  assert.match(runner, /apikey: serviceRoleKey/)
  assert.match(runner, /if \(jwtShaped\(serviceRoleKey\)\) headers\.authorization =/)
  assert.match(runner, /functions\/v1\/dgp-postgres-connector/)
  assert.doesNotMatch(runner, /admin\.functions\.invoke\('dgp-postgres-connector'/)
})

test('runner surfaces sanitized connector status and error evidence', () => {
  assert.match(runner, /HTTP \$\{response\.status\}: \$\{safeError\}/)
  assert.match(runner, /typeof payload\?\.error === 'string'/)
  assert.doesNotMatch(runner, /console\.log\(serviceRoleKey\)/)
})


test('Databricks PUB Gold lineage is manual-only and cannot run on push or pull_request', () => {
  assert.match(workflow, /live-databricks-field-lineage:\n\s+if: github\.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /databricks-pub-gold-preview/)
  assert.match(workflow, /databricks-pub-gold-apply/)
  assert.match(workflow, /LINEAGE_SOURCE_ID: f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b/)
})

test('Databricks live revalidation fails closed without exact current-scope discovery evidence', () => {
  assert.match(databricksRunner, /current_version_id/)
  assert.match(databricksRunner, /\.eq\('scope_version_id', scopeVersion\.id\)/)
  assert.match(databricksRunner, /Current-scope Databricks discovery evidence is required/)
  assert.match(databricksRunner, /objects_missing/)
  assert.match(databricksRunner, /objects_observed/)
})

test('Databricks live revalidation accepts only source-observed system lineage authority', () => {
  assert.match(databricksRunner, /system\.access\.table_lineage/)
  assert.match(databricksRunner, /system\.access\.column_lineage/)
  assert.match(databricksRunner, /Untrusted Databricks lineage authority/)
  assert.match(databricksRunner, /Databricks field mapping is missing system\.access\.column_lineage authority/)
})

test('Databricks apply mode uses atomic governed ingestion and preview mode stays non-mutating', () => {
  assert.match(databricksRunner, /LINEAGE_APPLY/)
  assert.match(databricksRunner, /if \(apply && deduped\.length\)/)
  assert.match(databricksRunner, /ingest_lineage_batch_atomic/)
  assert.match(databricksRunner, /audit_atomic/)
  assert.match(databricksRunner, /database_capability_verified/)
  assert.match(workflow, /LINEAGE_APPLY: \$\{\{ inputs\.operation == 'databricks-pub-gold-apply' \}\}/)
})

test('Databricks evidence is bounded to the explicit selected source scope', () => {
  assert.match(databricksRunner, /selection\.mode !== 'SELECTED'/)
  assert.match(databricksRunner, /selection\.qualifiedNames/)
  assert.match(databricksRunner, /selectedTables: qualifiedNames/)
  assert.match(databricksRunner, /coveredTableCount/)
  assert.match(databricksRunner, /uncoveredTables/)
})
