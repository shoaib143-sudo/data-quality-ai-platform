import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const route = fs.readFileSync(new URL('../app/api/internal/storage/certify-r2/route.ts', import.meta.url), 'utf8')

test('R2 certification paginates storage and dataset-version inventories', () => {
  assert.match(route, /CERTIFICATION_PAGE_SIZE = 1000/)
  assert.match(route, /CERTIFICATION_MAX_ROWS = 100_000/)
  assert.match(route, /from\('storage_objects'\)[\s\S]*?\.range\(from, from \+ CERTIFICATION_PAGE_SIZE - 1\)/)
  assert.match(route, /from\('dataset_versions'\)[\s\S]*?\.range\(from, from \+ CERTIFICATION_PAGE_SIZE - 1\)/)
  assert.match(route, /\.order\('id', \{ ascending: true \}\)/)
})

test('R2 certification fails closed instead of silently truncating oversized inventories', () => {
  assert.match(route, /inventory exceeds bounded certification ceiling/)
  assert.match(route, /status: 503/)
  assert.doesNotMatch(route, /\.limit\(1000\)/)
})
