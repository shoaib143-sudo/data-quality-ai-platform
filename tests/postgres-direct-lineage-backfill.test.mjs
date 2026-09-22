import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync('scripts/backfill-postgres-direct-lineage.ts', 'utf8')
const workflow = readFileSync('.github/workflows/postgres-direct-lineage-backfill.yml', 'utf8')

test('backfill uses the canonical lineage enrichment service rather than direct mapping inserts', () => {
  assert.match(script, /executeLineageEnrichment/)
  assert.doesNotMatch(script, /\.from\('lineage_column_mappings'\)\.insert/)
  assert.doesNotMatch(script, /\.from\('lineage_column_mappings'\)\.upsert/)
  assert.match(script, /status', 'COMPLETED'/)
  assert.match(script, /catalog_revision_id/)
})

test('live mutation runs only after merge to protected main', () => {
  assert.match(workflow, /live-backfill:[\s\S]*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /needs: verify/)
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/)
  assert.match(workflow, /POSTGRES_DIRECT_LINEAGE_BACKFILL_REQUIRED: 'true'/)
})

test('backfill fails closed when no direct mappings are produced', () => {
  assert.match(script, /if \(required && totalMappings < 1\)/)
  assert.match(script, /without persisting any direct column mappings/)
})
