import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = {
  profiling: fs.readFileSync('app/profiling/page.tsx', 'utf8'),
  dashboard: fs.readFileSync('app/profiling/profiling-dashboard.tsx', 'utf8'),
  resource: fs.readFileSync('app/resource-access/page.tsx', 'utf8'),
  retention: fs.readFileSync('app/retention/page.tsx', 'utf8'),
  scorecards: fs.readFileSync('app/scorecards/page.tsx', 'utf8'),
  settings: fs.readFileSync('app/settings/page.tsx', 'utf8'),
  platform: fs.readFileSync('app/platform/page.tsx', 'utf8'),
}

const expected = {
  profiling: ['Open datasets', 'No profiling evidence yet'],
  dashboard: ['Full profiling report', 'Data Observability', 'Data Quality', 'View full profiling report', 'Open full field explorer'],
  resource: ['Approvals', 'Job Monitor', 'Dataset access control'],
  retention: ['Admin', 'Audit', 'Reports', 'Retention and archival'],
  scorecards: ['Catalog', 'Data Quality', 'Reports', 'Governance Scorecards'],
  settings: ['Profile', 'Job Monitor', 'Return home', 'Settings'],
  platform: ['Job Monitor', 'Administration', 'Audit', 'Capacity, recovery and release gates'],
}

for (const [key, labels] of Object.entries(expected)) {
  for (const label of labels) assert.ok(pages[key].includes(label), key + ' missing CTA or interaction: ' + label)
}

for (const routeFile of [
  'app/datasets/page.tsx',
  'app/profiling/explorer/page.tsx',
  'app/monitoring/page.tsx',
  'app/data-quality/page.tsx',
  'app/approvals/page.tsx',
  'app/admin/page.tsx',
  'app/audit/page.tsx',
  'app/reports/page.tsx',
  'app/catalog/page.tsx',
  'app/profile/page.tsx',
]) {
  assert.ok(fs.existsSync(routeFile), 'Wave 7 navigation target does not exist: ' + routeFile)
}

assert.ok(pages.retention.includes('OWNER or ADMIN access is required to configure project retention.'), 'Retention must retain explicit no-authority state')
assert.ok(pages.profiling.includes('No profiling evidence yet'), 'Profiling must retain explicit empty evidence state')

console.log('Wave 7 CTA inventory, destination, and failure-state contract passed.')