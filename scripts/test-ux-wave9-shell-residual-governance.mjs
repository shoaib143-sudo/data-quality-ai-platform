import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces = [
  ['Metadata Discovery','app/catalog/discovery/page.tsx'],
  ['Physical Metadata Assets','app/catalog/physical-assets/page.tsx'],
  ['Data Quality Rules','app/data-quality/rules/page.tsx'],
  ['Data Quality Exceptions','app/data-quality/exceptions/page.tsx'],
  ['Lineage Impact','app/lineage/impact/page.tsx'],
  ['Lineage Suggestions','app/lineage/suggestions/page.tsx'],
]

for (const [label,path] of surfaces) {
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

assert.ok(!fs.readFileSync('app/catalog/discovery/page.tsx','utf8').includes('Data Governance PowerHouse'), 'Discovery must not retain legacy brand shell')
assert.ok(!fs.readFileSync('app/data-quality/rules/page.tsx','utf8').includes('DataNexus AI</Link>'), 'DQ Rules must not retain duplicate brand shell')
assert.ok(!fs.readFileSync('app/lineage/suggestions/page.tsx','utf8').includes('Data Governance PowerHouse'), 'Lineage Suggestions must not retain legacy brand shell')

console.log('Wave 9 residual-governance Product Shell contract passed.')
