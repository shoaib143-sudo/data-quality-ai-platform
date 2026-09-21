import assert from 'node:assert/strict'
import fs from 'node:fs'

const datasets = fs.readFileSync('app/datasets/page.tsx', 'utf8')
const explorer = fs.readFileSync('app/profiling/explorer/page.tsx', 'utf8')
const monitoring = fs.readFileSync('app/monitoring/page.tsx', 'utf8')

for (const [name, source, label] of [
  ['datasets', datasets, 'Sources & Datasets'],
  ['profiling explorer', explorer, 'Profiling Explorer'],
  ['job monitor', monitoring, 'Job Monitor'],
]) {
  assert.ok(source.includes('<GlobalUtilityBar'), `${name} must use the shared Product Shell`)
  assert.ok(source.includes(`roleLabel="${label}"`), `${name} must preserve its local context label`)
}

assert.ok(datasets.includes('Governance Runs'), 'onboarding must expose Governance Runs from its local context bar')
assert.ok(datasets.includes('Profiling Workspace'), 'onboarding must preserve the profiling continuation CTA')
assert.ok(explorer.includes('canonicalRoutes.governedDataset(String(datasetContext.data.id))'), 'Profiling Explorer must return to Dataset 360')
assert.ok(explorer.includes('canonicalRoutes.governanceRun(projectId)'), 'Profiling Explorer must return to Governance Run')
assert.ok(explorer.includes("id=\"main-content\""), 'Profiling Explorer must expose the skip-link target')
assert.ok(monitoring.includes('Execution Recovery'), 'Job Monitor must preserve recovery navigation')
assert.ok(monitoring.includes('Run governed feature'), 'Job Monitor must preserve governed execution navigation')
assert.ok(!datasets.includes('Data Governance PowerHouse</Link>'), 'onboarding must not retain a duplicate legacy brand shell')

console.log('Wave 2 Product Shell contract passed.')
