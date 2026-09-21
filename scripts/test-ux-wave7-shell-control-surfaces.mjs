import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces = [
  ['Resource Access', 'app/resource-access/page.tsx'],
  ['Retention', 'app/retention/page.tsx'],
  ['Scorecards', 'app/scorecards/page.tsx'],
  ['Settings', 'app/settings/page.tsx'],
  ['Platform Controls', 'app/platform/page.tsx'],
]

for (const [role, path] of surfaces) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), role + ' must use the shared Product Shell')
  assert.ok(source.includes('roleLabel="' + role + '"'), role + ' must expose its local Product Shell label')
  assert.ok(source.includes('id="main-content"'), role + ' must expose the shared skip-link target')
  assert.ok(source.includes('tabIndex={-1}'), role + ' skip-link target must be focusable')
}

const profilingPage = fs.readFileSync('app/profiling/page.tsx', 'utf8')
const profilingDashboard = fs.readFileSync('app/profiling/profiling-dashboard.tsx', 'utf8')
assert.ok(profilingPage.includes('roleLabel="Profiling"'), 'Profiling empty state must use the shared Product Shell')
assert.ok(profilingPage.includes('persona={landing.persona}'), 'Profiling page must pass persona context to the populated dashboard')
assert.ok(profilingDashboard.includes('<GlobalUtilityBar'), 'Populated Profiling Dashboard must use the shared Product Shell')
assert.ok(profilingDashboard.includes('id="main-content"'), 'Populated Profiling Dashboard must expose the skip-link target')
assert.ok(profilingDashboard.includes('tabIndex={-1}'), 'Populated Profiling Dashboard skip-link target must be focusable')

for (const path of ['app/retention/page.tsx','app/scorecards/page.tsx','app/platform/page.tsx']) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(!source.includes('DataNexus AI</Link>'), path + ' must not retain duplicate legacy shell branding')
  assert.ok(!source.includes('Data Governance PowerHouse</Link>'), path + ' must not retain duplicate legacy shell branding')
}

console.log('Wave 7 control surface Product Shell contract passed.')