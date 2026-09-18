import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/migrate-to-r2/route.ts', import.meta.url), 'utf8')

test('R2 migration scans past already migrated sources while remaining bounded', () => {
  assert.match(route, /SOURCE_SCAN_PAGE_SIZE = 100/)
  assert.match(route, /MAX_SOURCE_SCAN_ROWS = 1000/)
  assert.match(route, /\.range\(offset, offset \+ SOURCE_SCAN_PAGE_SIZE - 1\)/)
  assert.match(route, /candidates\.length < batchSize\(\)/)
  assert.match(route, /\.eq\('state', 'READY'\)[\s\S]*?if \(!readyTarget\) candidates\.push\(source\)/)
})

test('R2 migration prefilters terminally ineligible sources before filling a batch', () => {
  assert.match(route, /\.not\('size_bytes', 'is', null\)/)
  assert.match(route, /\.not\('verified_at', 'is', null\)/)
  assert.match(route, /\.lte\('size_bytes', objectLimit\)/)
  assert.match(route, /\.or\('checksum\.is\.null,checksum_algorithm\.eq\.sha256'\)/)
})

test('R2 migration reports scanned and selected counts without destructive cutover', () => {
  assert.match(route, /examined,/)
  assert.match(route, /selected: candidates\.length/)
  assert.match(route, /sourceObjectsDeleted: 0/)
  assert.match(route, /datasetVersionReferencesChanged: 0/)
})
