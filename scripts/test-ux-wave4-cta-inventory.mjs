import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = {
  catalog: fs.readFileSync('app/catalog/page.tsx', 'utf8'),
  issues: fs.readFileSync('app/issues/page.tsx', 'utf8'),
  quality: fs.readFileSync('app/data-quality/page.tsx', 'utf8'),
  reports: fs.readFileSync('app/reports/page.tsx', 'utf8'),
  agents: fs.readFileSync('app/agents/page.tsx', 'utf8'),
  ai: fs.readFileSync('app/ai-capabilities/page.tsx', 'utf8'),
}

const expected = {
  catalog: ['Discovery','Physical Assets','Glossary'],
  issues: ['Profiling findings','Data Quality'],
  quality: ['Profiling Explorer','Quality Rules','Observability','Open profiling evidence','Open issues'],
  reports: ['Catalog','Observability','Audit','Open experience insights'],
  agents: ['Review learning cases','Open Job Monitor','View agent details'],
  ai: ['Open AI Insights','Apply'],
}

for (const [key, labels] of Object.entries(expected)) {
  for (const label of labels) assert.ok(pages[key].includes(label), key + ' missing CTA or interaction: ' + label)
}

assert.ok(pages.ai.includes('<button type="submit"'), 'AI Capability filter button must have an explicit submit type')
for (const [key, source] of Object.entries(pages)) {
  assert.ok(source.includes('id="main-content"'), key + ' must provide the shared skip-link destination')
}

for (const routeFile of [
  'app/catalog/discovery/page.tsx',
  'app/catalog/physical-assets/page.tsx',
  'app/glossary/page.tsx',
  'app/profiling/explorer/page.tsx',
  'app/data-quality/page.tsx',
  'app/observability/page.tsx',
  'app/reports/experience/page.tsx',
  'app/audit/page.tsx',
  'app/admin/learning-cases/page.tsx',
  'app/monitoring/page.tsx',
  'app/ai-insights/page.tsx',
]) {
  assert.ok(fs.existsSync(routeFile), 'Wave 4 CTA destination does not exist: ' + routeFile)
}

console.log('Wave 4 CTA inventory, route destination, and accessibility contract passed.')
