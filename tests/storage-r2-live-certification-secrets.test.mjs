import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')
test('certification fails when required secret configuration is absent', () => {
  const job = workflow.slice(workflow.indexOf('  live-production-certification:'))
  assert.match(job, /R2_CERTIFICATION_APP_URL is not configured/)
  assert.match(job, /CRON_SECRET is not configured/)
})
