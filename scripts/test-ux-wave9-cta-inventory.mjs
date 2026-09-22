import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/catalog/discovery/page.tsx':['Catalog'],
  'app/catalog/physical-assets/page.tsx':['Catalog','Discovery'],
  'app/data-quality/rules/page.tsx':['Data Quality','Job Monitor'],
  'app/data-quality/exceptions/page.tsx':['Data Quality','Rules','Job Monitor'],
  'app/lineage/impact/page.tsx':['← Lineage','AI Operations Center','Lineage ingestion'],
  'app/lineage/suggestions/page.tsx':['Lineage explorer','Impact analysis','Ingest observed lineage'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA: ${label}`)
}

for(const route of [
  'app/catalog/page.tsx',
  'app/catalog/discovery/page.tsx',
  'app/data-quality/page.tsx',
  'app/monitoring/page.tsx',
  'app/lineage/page.tsx',
  'app/lineage/impact/page.tsx',
  'app/lineage/ingest/page.tsx',
  'app/observability/incidents/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 9 CTA destination missing: ${route}`)

console.log('Wave 9 CTA inventory and destination contract passed.')
