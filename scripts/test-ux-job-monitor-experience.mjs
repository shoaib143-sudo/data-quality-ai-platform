import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/monitoring/page.tsx','utf8')
for(const marker of [
  'See where every governed run is, why it moved, and what needs intervention.',
  'Active runs',
  'Failed / stopped',
  'Completed',
  'Active steps',
  'Living Data Domains',
  '<JobHealth',
  '<JobMonitor',
]) assert.ok(source.includes(marker), `job-monitor UX marker missing: ${marker}`)

assert.ok(source.includes("['QUEUED','RUNNING','RETRYING','PAUSED']"), 'active run count must derive from execution status')
assert.ok(source.includes("['FAILED','DEAD','CANCELLED']"), 'failure count must derive from terminal failure status')
assert.ok(source.includes("['SUCCEEDED','COMPLETED']"), 'completed count must derive from success status')
assert.ok(source.includes('filterAuthorizedExecutionRuns'), 'monitor must retain canonical run visibility authorization')
assert.ok(source.includes('href="/recovery"'), 'execution recovery path must remain available')
assert.ok(source.includes('href="/agents"'), 'governed feature launch path must remain available')

console.log('Job Monitor UX experience contract passed.')
