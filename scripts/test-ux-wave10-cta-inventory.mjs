import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/data-quality/autonomous/page.tsx':['← Data Quality','Approvals','Remediation issues','Run evidence'],
  'app/classification-privacy/page.tsx':['Catalog'],
  'app/lineage/ingest/page.tsx':['Lineage graph','Discovery'],
  'app/monitoring/domain/[projectId]/page.tsx':['Back to Job Monitor','Run governed feature','Latest output/results','View latest execution details','View results','Latest result'],
  'app/observability/incidents/page.tsx':['← Observability','Impact analysis','Response approvals','Open workflow'],
  'app/observability/settings/page.tsx':['Observability'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA or interaction: ${label}`)
}

for(const route of [
  'app/data-quality/page.tsx',
  'app/workflows/page.tsx',
  'app/issues/page.tsx',
  'app/catalog/page.tsx',
  'app/catalog/discovery/page.tsx',
  'app/lineage/page.tsx',
  'app/monitoring/page.tsx',
  'app/agents/page.tsx',
  'app/lineage/impact/page.tsx',
  'app/observability/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 10 CTA destination missing: ${route}`)

console.log('Wave 10 CTA inventory and destination contract passed.')