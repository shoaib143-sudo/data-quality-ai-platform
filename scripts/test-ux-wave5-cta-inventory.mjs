import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = {
  glossary: fs.readFileSync('app/glossary/page.tsx', 'utf8'),
  lineage: fs.readFileSync('app/lineage/page.tsx', 'utf8'),
  stewardship: fs.readFileSync('app/stewardship/page.tsx', 'utf8'),
  classification: fs.readFileSync('app/classification/page.tsx', 'utf8'),
  audit: fs.readFileSync('app/audit/page.tsx', 'utf8'),
  observability: fs.readFileSync('app/observability/page.tsx', 'utf8'),
}

const expected = {
  glossary: ['Catalog'],
  lineage: ['Catalog','Glossary','Data Quality','Impact analysis','Ingest lineage'],
  stewardship: ['Catalog'],
  classification: ['Catalog'],
  audit: ['Lineage'],
  observability: ['Datasets','Profiling evidence','Data Quality','Job Monitor','Settings','Open governance alerts'],
}

for (const [key, labels] of Object.entries(expected)) {
  for (const label of labels) assert.ok(pages[key].includes(label), key + ' missing CTA or interaction: ' + label)
  assert.ok(pages[key].includes('id="main-content"'), key + ' must provide the shared skip-link destination')
}

for (const routeFile of [
  'app/catalog/page.tsx',
  'app/data-quality/page.tsx',
  'app/glossary/page.tsx',
  'app/lineage/impact/page.tsx',
  'app/lineage/ingest/page.tsx',
  'app/datasets/page.tsx',
  'app/profiling/explorer/page.tsx',
  'app/monitoring/page.tsx',
  'app/observability/settings/page.tsx',
]) {
  assert.ok(fs.existsSync(routeFile), 'Wave 5 CTA destination does not exist: ' + routeFile)
}

console.log('Wave 5 CTA inventory, route destination, and accessibility contract passed.')
