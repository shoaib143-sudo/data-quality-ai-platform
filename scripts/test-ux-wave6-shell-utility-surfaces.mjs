import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces = [
  ['Global Search', 'app/search/page.tsx'],
  ['Profile', 'app/profile/page.tsx'],
  ['Schedules', 'app/schedules/page.tsx'],
  ['Execution Recovery', 'app/recovery/page.tsx'],
  ['Governed Documents', 'app/documents/page.tsx'],
  ['Data Contracts', 'app/contracts/page.tsx'],
]

for (const [role, path] of surfaces) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), role + ' must use the shared Product Shell')
  assert.ok(source.includes('roleLabel="' + role + '"'), role + ' must expose its local Product Shell label')
  assert.ok(source.includes('id="main-content"'), role + ' must expose the shared skip-link target')
  assert.ok(source.includes('tabIndex={-1}'), role + ' skip-link target must be programmatically focusable')
}

for (const path of ['app/search/page.tsx','app/schedules/page.tsx','app/documents/page.tsx','app/contracts/page.tsx']) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(!source.includes('DataNexus AI</Link>'), path + ' must not retain a duplicate legacy brand shell')
  assert.ok(!source.includes('Data Governance PowerHouse</Link>'), path + ' must not retain a duplicate legacy product shell')
}

console.log('Wave 6 utility Product Shell contract passed.')
