import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces = [
  ['Business Glossary', 'app/glossary/page.tsx'],
  ['Lineage', 'app/lineage/page.tsx'],
  ['Stewardship', 'app/stewardship/page.tsx'],
  ['Classification', 'app/classification/page.tsx'],
  ['Audit', 'app/audit/page.tsx'],
  ['Observability', 'app/observability/page.tsx'],
]

for (const [role, path] of surfaces) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), role + ' must use the shared Product Shell')
  assert.ok(source.includes('roleLabel="' + role + '"'), role + ' must expose its local Product Shell label')
  assert.ok(source.includes('id="main-content"'), role + ' must expose the shared skip-link target')
  assert.ok(!source.includes('DataNexus AI</Link>'), role + ' must not retain duplicate legacy brand navigation')
  assert.ok(!source.includes('Data Governance PowerHouse</Link>'), role + ' must not retain duplicate legacy brand navigation')
}

console.log('Wave 5 governance-surface Product Shell contract passed.')
