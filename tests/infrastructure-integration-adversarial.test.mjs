import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
const storageFactory = fs.readFileSync('lib/storage/factory.ts', 'utf8')
const r2 = fs.readFileSync('lib/storage/r2.ts', 'utf8')
const upload = fs.readFileSync('app/api/datasets/source/upload-file/route.ts', 'utf8')
const certification = fs.readFileSync('app/api/internal/storage/certify-r2/route.ts', 'utf8')
const release = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')
const r2Workflow = fs.readFileSync('.github/workflows/storage-r2-assurance.yml', 'utf8')

test('Vercel flood control stays disabled for automatic Git deployments', () => {
  assert.equal(vercel.git?.deploymentEnabled, false)
})

test('dataset uploads use the provider-neutral storage boundary', () => {
  assert.match(upload, /defaultStorageProvider/)
  assert.match(upload, /bulkStorageProvider/)
  assert.match(upload, /createObjectStorage/)
  assert.doesNotMatch(upload, /admin\.storage\.from\(/)
})

test('production R2 cannot become default without explicit approval', () => {
  assert.match(storageFactory, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED/)
  assert.match(storageFactory, /isProductionEnvironment\(\)/)
  assert.match(storageFactory, /Production R2 storage cutover requires/)
})

test('R2 credentials remain server-only and account-scoped', () => {
  assert.match(r2, /R2_SECRET_ACCESS_KEY/)
  assert.match(r2, /R2_ACCESS_KEY_ID/)
  assert.match(r2, /r2\.cloudflarestorage\.com/)
  assert.doesNotMatch(r2, /NEXT_PUBLIC_R2_/)
})

test('R2 certification is authenticated, read-only, and exposes no credential value', () => {
  assert.match(certification, /requireInternalAutomation/)
  assert.match(certification, /destructiveActions: 0/)
  assert.doesNotMatch(certification, /R2_SECRET_ACCESS_KEY[^'"]*process\.env/)
  assert.doesNotMatch(certification, /secretAccessKey/)
})

test('Cloudflare and R2 production operations remain explicit manual workflows', () => {
  assert.match(release, /workflow_dispatch:/)
  assert.match(r2Workflow, /workflow_dispatch:/)
  assert.match(release, /confirm_paid_activation/)
  assert.match(r2Workflow, /allow_cors_mutation/)
  assert.match(r2Workflow, /allow_r2_copy/)
  assert.doesNotMatch(r2Workflow, /"mode":"apply"/)
})

test('cross-provider rollback evidence is required before cutover', () => {
  assert.match(r2Workflow, /dry-run-rollback/)
  assert.match(r2Workflow, /sourceObjectsDeleted/)
  assert.match(r2Workflow, /targetObjectsDeleted/)
})
