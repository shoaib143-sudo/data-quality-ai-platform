import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync('.github/workflows/v6-operational-certification.yml', 'utf8')

test('clean reconstruction derives an isolated local Supabase port block per workflow run', () => {
  assert.match(workflow, /const runId = BigInt\(process\.argv\[2\]\)/)
  assert.match(workflow, /const slot = Number\(runId % 900n\)/)
  assert.match(workflow, /const base = 56000 \+ slot \* 10/)
  assert.match(workflow, /config\.replace\(\/\\b5432\(\[0-9\]\)\\b\/g/)
})

test('port isolation is configured before Supabase starts', () => {
  const init = workflow.indexOf('pnpm dlx supabase@2.117.0 init')
  const isolation = workflow.indexOf('isolatedSupabasePortBase')
  const start = workflow.indexOf('pnpm dlx supabase@2.117.0 start')
  assert.ok(init >= 0)
  assert.ok(isolation > init)
  assert.ok(start > isolation)
})

test('pull-request V6 sentinel executes the port-isolation contract test', () => {
  const certifyStart = workflow.indexOf('  certify:')
  const fullStart = workflow.indexOf('  certify-full:')
  const certify = workflow.slice(certifyStart, fullStart)
  assert.match(certify, /node --test tests\/v6-clean-reconstruction-port-isolation\.test\.mjs/)
})
