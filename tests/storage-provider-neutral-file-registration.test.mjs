import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/datasets/source/register/route.ts', import.meta.url), 'utf8')

test('FILE registration accepts R2, Supabase, storage, and legacy bucket/path source forms', () => {
  assert.match(route, /\^\(r2\|supabase\|storage\):\\\/\\\/\(\[\^\/\]\+\)\\\/\(\.\+\)\$/i)
  assert.match(route, /provider === 'r2'/)
  assert.match(route, /provider !== 'supabase' && provider !== 'storage'/)
  assert.match(route, /bucket !== 'dataset-files'/)
})

test('R2 FILE registration is bucket-scoped and project-prefix scoped', () => {
  assert.match(route, /process\.env\.R2_BUCKET/)
  assert.match(route, /process\.env\.R2_PREFIX/)
  assert.match(route, /bucket !== configuredBucket/)
  assert.match(route, /projectPath\.startsWith\(requiredPrefix\)/)
  assert.match(route, /R2 FILE\/CSV source bucket is outside the configured application scope/)
})

test('Supabase FILE registration remains constrained to dataset-files project scope', () => {
  assert.match(route, /Supabase FILE\/CSV sources must be stored under dataset-files/)
  assert.match(route, /requiredPrefix = `projects\/\$\{projectId\}\/`/)
  assert.match(route, /storage_provider: 'supabase'/)
})

test('FILE registration persists explicit provider-neutral storage metadata', () => {
  assert.match(route, /storage_provider: 'r2'/)
  assert.match(route, /storage_provider: 'supabase'/)
  assert.match(route, /storage_bucket: bucket/)
  assert.match(route, /storage_path: path/)
})
