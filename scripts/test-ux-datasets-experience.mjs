import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/datasets/page.tsx','utf8')
for(const marker of [
  'Connect your data. Observe it.',
  '1 · Configure',
  '2 · Observe',
  '3 · Profile',
  'Observed ready now',
  'Profiling Workspace',
  'Governance Runs',
  '1. Connect a source',
  '2. Register a dataset',
]) assert.ok(source.includes(marker), `datasets UX marker missing: ${marker}`)

assert.ok(source.includes("bg-[#050b17]"), 'datasets must use the native DataNexus dark canvas')
assert.ok(source.includes("row.operational_state === 'OBSERVED_READY'"), 'observed readiness must remain evidence-derived')
assert.ok(source.includes("latest.status === 'AVAILABLE'"), 'profiling readiness must continue to require an available version')
assert.ok(source.includes("executionSource?.active"), 'profiling readiness must continue to require an active execution binding')
assert.ok(source.includes("source?.status === 'ACTIVE'"), 'profiling readiness must continue to require active source lifecycle')
assert.ok(source.includes('ACTIVE is not treated as proof of discovery observation.'), 'source lifecycle and observation authority must remain distinct')

console.log('Datasets onboarding UX experience contract passed.')
