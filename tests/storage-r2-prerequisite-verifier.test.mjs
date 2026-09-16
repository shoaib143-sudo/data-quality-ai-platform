import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const verifier = fs.readFileSync(new URL('../scripts/verify-r2-prerequisites.mjs', import.meta.url), 'utf8')
const packageJson = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')

test('R2 prerequisite verifier matches the approved single-bucket runtime contract', () => {
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_PREFIX']) {
    assert.match(verifier, new RegExp(name))
  }
  assert.doesNotMatch(verifier, /R2_BUCKET_DATASETS/)
  assert.match(verifier, /datanexus-r2/)
  assert.match(verifier, /r2\.cloudflarestorage\.com/)
})

test('R2 prerequisite verifier guards current provider-neutral upload architecture', () => {
  assert.match(verifier, /admin\.storage\.from\(/)
  assert.match(verifier, /createObjectStorage/)
  assert.match(verifier, /defaultStorageProvider/)
  assert.match(verifier, /storage_objects/)
  assert.match(verifier, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED/)
  assert.match(verifier, /NEXT_PUBLIC_R2_/)
})

test('R2 prerequisite verifier is exposed as a package command', () => {
  assert.match(packageJson, /"verify:r2-prerequisites": "node scripts\/verify-r2-prerequisites\.mjs"/)
})
