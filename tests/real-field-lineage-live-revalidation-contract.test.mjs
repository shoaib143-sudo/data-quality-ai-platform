import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/lineage-authority-integrity.yml', 'utf8')
const runner = readFileSync('scripts/run-real-field-lineage-revalidation.mjs', 'utf8')

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
