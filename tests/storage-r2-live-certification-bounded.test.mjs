import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')
test('certification network call has strict time bounds', () => {
  const job = workflow.slice(workflow.indexOf('  live-production-certification:'))
  assert.match(job, /--connect-timeout 10 --max-time 60/)
  assert.match(job, /--fail-with-body/)
})
