import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('PostgreSQL complete-range analytics paginates to source exhaustion', () => {
  const source = fs.readFileSync('lib/data-plane/providers/postgres-analytics-query-provider.ts', 'utf8')
  for (const token of [
    'request.completeRange',
    'COMPLETE_RANGE_PAGE_SIZE',
    ".order('occurred_at', { ascending: true })",
    ".order('id', { ascending: true })",
    '.range(offset, offset + COMPLETE_RANGE_PAGE_SIZE - 1)',
    'if (page.length < COMPLETE_RANGE_PAGE_SIZE) break',
    'offset += page.length',
  ]) assert.ok(source.includes(token), `missing PostgreSQL complete-range invariant: ${token}`)
})

test('ClickHouse complete-range analytics cannot silently truncate at the interactive row limit', () => {
  const source = fs.readFileSync('lib/data-plane/providers/clickhouse-analytics-query-provider.ts', 'utf8')
  for (const token of [
    'request.completeRange',
    'CLICKHOUSE_COMPLETE_RANGE_MAX_RESULT_ROWS',
    "const rowLimit = request.completeRange ? ''",
    "result_overflow_mode', 'throw'",
  ]) assert.ok(source.includes(token), `missing ClickHouse complete-range invariant: ${token}`)
})
