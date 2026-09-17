import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')
const certification = workflow.slice(workflow.indexOf('  live-production-certification:'))

test('certification secrets stay scoped to certification steps', () => {
  const contractJob = workflow.slice(0, workflow.indexOf('  live-production-certification:'))
  assert.doesNotMatch(contractJob, /CRON_SECRET|R2_CERTIFICATION_APP_URL/)
  assert.match(certification, /environment: production/)
})
