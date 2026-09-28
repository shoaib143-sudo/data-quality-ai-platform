import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/journeys/page.tsx','utf8')
for(const marker of [
  'Guided journey',
  'Role responsibility and platform lifecycle evidence remain separate.',
  'Your role workflow',
  'Platform evidence lifecycle',
  'Next best action',
  'Open Governance Run',
  'Evidence stage',
]) assert.ok(source.includes(marker), `governance-runs UX marker missing: ${marker}`)

assert.ok(source.includes("bg-[#050b17]"), 'governance runs must use the native DataNexus dark canvas')
assert.ok(source.includes('persona.primaryQuestion'), 'role workflow must remain persona derived')
assert.ok(source.includes('safeHref('), 'journey actions must retain workspace authorization fallback')
assert.ok(source.includes("readinessBySource.get(source.id) === 'OBSERVED_READY'"), 'discovery stage must remain evidence derived')
assert.ok(source.includes("normalized(run.status) === 'COMPLETED'"), 'profile stage must remain completed-run evidence derived')
assert.ok(source.includes('qualityVerified'), 'verify-controls stage must remain rule execution evidence derived')

console.log('Governance Runs UX experience contract passed.')
