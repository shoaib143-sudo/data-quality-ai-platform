import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/internal/storage/certify-r2/route.ts', 'utf8')
const workflow = fs.readFileSync('.github/workflows/storage-r2-assurance.yml', 'utf8')

test('R2 certification reports live adoption by referenced storage provider', () => {
  assert.match(route, /referencedProviderCounts/)
  assert.match(route, /\{ supabase: 0, r2: 0 \}/)
  assert.match(route, /storageById\.get\(id\)\?\.provider/)
  assert.match(route, /referencedProviderCounts,/)
})

test('R2 readiness remains non-destructive and does not require reference cutover', () => {
  assert.match(route, /destructiveActions: 0/)
  assert.doesNotMatch(route, /deleteObject\(/)
  assert.doesNotMatch(route, /dataset_versions[\s\S]*\.update\(/)
})

test('production readiness and certification are manual protected operations', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /production-readiness/)
  assert.match(workflow, /production-certify/)
  assert.match(workflow, /id-token: write/)
})

test('reference mutation remains dry-run during certification', () => {
  assert.match(workflow, /--data '\{"mode":"dry-run"\}'/)
  assert.match(workflow, /--data '\{"mode":"dry-run-rollback"\}'/)
  assert.doesNotMatch(workflow, /--data '\{"mode":"apply"\}'/)
})
