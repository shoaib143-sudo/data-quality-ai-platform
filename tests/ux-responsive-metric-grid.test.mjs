import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dq = fs.readFileSync('app/data-quality/page.tsx','utf8')
const observability = fs.readFileSync('app/observability/page.tsx','utf8')

test('data quality summary cards stack before four-column density', () => {
  assert.match(dq, /grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-4/)
  assert.match(dq, /min-h-\[148px\] min-w-0 flex-col/)
})

test('data quality run metrics do not force five columns at laptop widths', () => {
  assert.match(dq, /grid auto-rows-fr gap-2 sm:grid-cols-2 xl:grid-cols-5/)
  assert.match(dq, /min-w-0 overflow-hidden p-3/)
})

test('observability summary cards use progressive breakpoints', () => {
  assert.match(observability, /sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6/)
})
