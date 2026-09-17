import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')
test('certification endpoint cannot be supplied as workflow input', () => {
  const job = workflow.slice(workflow.indexOf('  live-production-certification:'))
  assert.match(job, /\$APP_URL\/api\/internal\/storage\/certify-r2/)
  assert.doesNotMatch(job, /inputs\./)
})
