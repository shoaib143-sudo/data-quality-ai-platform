import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')
test('production certification depends on storage guards', () => {
  const job = workflow.slice(workflow.indexOf('  live-production-certification:'))
  assert.match(job, /needs: storage-contract-and-adversarial-guards/)
})
