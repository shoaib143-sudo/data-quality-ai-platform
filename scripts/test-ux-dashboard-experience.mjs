import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/dashboard/page.tsx','utf8')

for(const marker of [
  'Executive governance overview',
  'Attention now',
  'Governance coverage',
  'Act next',
  'Primary governance workspaces',
  '<details',
  'All governance workspaces',
]) assert.ok(source.includes(marker), `dashboard UX marker missing: ${marker}`)

assert.ok(source.includes('bg-[#050b17]'), 'dashboard must use the native DataNexus dark canvas')
assert.ok(!source.includes('linear-gradient(180deg,_#f8fbff'), 'dashboard must not retain the legacy light canvas')
assert.ok(source.includes('No assumed business loss is presented as fact.'), 'dashboard must preserve the business-evidence truth boundary')
assert.ok(source.includes('style={{ width:'), 'dashboard must visually expose governed evidence coverage')
assert.ok(source.includes('highFindings.length'), 'dashboard priority count must remain evidence-backed')
assert.ok(source.includes('failedJobs'), 'dashboard must retain operational failure evidence')

console.log('Executive Dashboard UX experience contract passed.')
