import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = {
  search: fs.readFileSync('app/search/page.tsx', 'utf8'),
  profile: fs.readFileSync('app/profile/page.tsx', 'utf8'),
  schedules: fs.readFileSync('app/schedules/page.tsx', 'utf8'),
  recovery: fs.readFileSync('app/recovery/page.tsx', 'utf8'),
  documents: fs.readFileSync('app/documents/page.tsx', 'utf8'),
  contracts: fs.readFileSync('app/contracts/page.tsx', 'utf8'),
}

const expected = {
  search: ['Catalog', 'Global Governance Search'],
  profile: ['Return home', 'Settings'],
  schedules: ['Job Monitor', 'Data Quality', 'Scheduled profiling & data quality'],
  recovery: ['AI Agents', 'Recovery action ledger', 'Execution Recovery'],
  documents: ['Catalog', 'Search', 'Open dataset', 'Profiling evidence', 'Focus chunk'],
  contracts: ['Catalog', 'Profiling evidence', 'Issues', 'Data Contracts'],
}

for (const [key, labels] of Object.entries(expected)) {
  for (const label of labels) assert.ok(pages[key].includes(label), key + ' missing CTA or interaction: ' + label)
}

for (const routeFile of [
  'app/catalog/page.tsx',
  'app/settings/page.tsx',
  'app/monitoring/page.tsx',
  'app/data-quality/page.tsx',
  'app/agents/page.tsx',
  'app/search/page.tsx',
  'app/profiling/explorer/page.tsx',
  'app/issues/page.tsx',
]) {
  assert.ok(fs.existsSync(routeFile), 'Wave 6 navigation target does not exist: ' + routeFile)
}

assert.ok(pages.documents.includes('selected.profile_run_id'), 'Documents profiling CTA must require linked profiling evidence')
assert.ok(pages.recovery.includes('item.agent_run_id &&'), 'Recovery run CTA must require a linked agent run')
assert.ok(pages.schedules.includes('No project with schedule management permission is available.'), 'Schedules must retain an explicit no-permission empty state')

console.log('Wave 6 CTA inventory, destination, and empty-state contract passed.')
