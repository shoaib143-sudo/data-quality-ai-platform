import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces=[
  ['Autonomous Data Quality','app/data-quality/autonomous/page.tsx'],
  ['Classification & Privacy','app/classification-privacy/page.tsx'],
  ['Lineage Ingestion','app/lineage/ingest/page.tsx'],
  ['Domain Monitoring','app/monitoring/domain/[projectId]/page.tsx'],
  ['AI Operations Center','app/observability/incidents/page.tsx'],
  ['Observability Settings','app/observability/settings/page.tsx'],
]

for(const [label,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

assert.ok(!fs.readFileSync('app/classification-privacy/page.tsx','utf8').includes('DataNexus AI\n'), 'Classification Privacy must not retain duplicate brand shell')
assert.ok(!fs.readFileSync('app/lineage/ingest/page.tsx','utf8').includes('Data Governance PowerHouse'), 'Lineage Ingestion must not retain legacy brand shell')
assert.ok(!fs.readFileSync('app/observability/settings/page.tsx','utf8').includes('DataNexus AI</Link>'), 'Observability Settings must not retain duplicate brand shell')

console.log('Wave 10 operational Product Shell contract passed.')
