import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces = [
  ['Data Catalog', 'app/catalog/page.tsx'],
  ['Issues', 'app/issues/page.tsx'],
  ['Data Quality', 'app/data-quality/page.tsx'],
  ['Reports', 'app/reports/page.tsx'],
  ['AI Agents', 'app/agents/page.tsx'],
  ['AI Capabilities', 'app/ai-capabilities/page.tsx'],
]

for (const [role, path] of surfaces) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), role + ' must use the shared Product Shell')
  assert.ok(source.includes('roleLabel="' + role + '"'), role + ' must expose its local Product Shell label')
  assert.ok(source.includes('id="main-content"'), role + ' must expose the shared skip-link target')
}

for (const path of ['app/catalog/page.tsx','app/issues/page.tsx','app/data-quality/page.tsx','app/reports/page.tsx']) {
  const source = fs.readFileSync(path, 'utf8')
  assert.ok(!source.includes('DataNexus AI</Link>'), path + ' must not retain a duplicate legacy brand shell')
}

console.log('Wave 4 core Product Shell surface contract passed.')
