import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/reference-cutover/route.ts', import.meta.url), 'utf8')

test('reference cutover scans beyond already-cut-over migration targets while remaining bounded', () => {
  assert.match(route, /TARGET_SCAN_PAGE_SIZE = 100/)
  assert.match(route, /MAX_TARGET_SCAN_ROWS = 1000/)
  assert.match(route, /targets\.length < batchSize\(\)/)
  assert.match(route, /\.range\(offset, offset \+ TARGET_SCAN_PAGE_SIZE - 1\)/)
  assert.match(route, /referencedIds\.has\(referenceId\)/)
  assert.match(route, /selectedTargets: targets\.length/)
})

test('reference cutover selects only migration targets that still participate in the requested direction', () => {
  assert.match(route, /rollbackMode \? page\.map\(\(row\) => row\.id\) : pageSourceIds/)
  assert.match(route, /rollbackMode \? target\.id : sourceId/)
  assert.match(route, /from\('dataset_versions'\)/)
  assert.match(route, /\.in\('storage_object_id', referenceIds\)/)
})

test('reference cutover limits dataset project lookup to versions in the selected batch', () => {
  assert.match(route, /const datasetIds = \[\.\.\.new Set/)
  assert.match(route, /from\('datasets'\)\.select\('id, project_id'\)\.in\('id', datasetIds\)/)
  assert.doesNotMatch(route, /from\('datasets'\)\.select\('id, project_id'\)\s*[,\n]/)
})

test('reference cutover remains compare-and-set and non-destructive', () => {
  assert.match(route, /\.eq\('storage_object_id', expectedCurrentId\)/)
  assert.match(route, /destructiveActions: 0/)
  assert.match(route, /sourceObjectsDeleted: 0/)
  assert.match(route, /targetObjectsDeleted: 0/)
  assert.doesNotMatch(route, /deleteObject/)
})
