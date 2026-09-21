import assert from 'node:assert/strict'
import fs from 'node:fs'

const paths=[
  'app/data-quality/autonomous/page.tsx',
  'app/classification-privacy/page.tsx',
  'app/lineage/ingest/page.tsx',
  'app/monitoring/domain/[projectId]/page.tsx',
  'app/observability/incidents/page.tsx',
  'app/observability/settings/page.tsx',
]
const source=Object.fromEntries(paths.map(path=>[path,fs.readFileSync(path,'utf8')]))

for(const path of paths){
  assert.ok(source[path].includes('<GlobalUtilityBar'), `adversarial: ${path} must use shared shell`)
  assert.ok(source[path].includes('id="main-content"'), `adversarial: ${path} must preserve skip target`)
}

assert.ok(source['app/data-quality/autonomous/page.tsx'].includes('canIssues ? <Link href="/issues"'), 'adversarial: unauthorized remediation issue navigation must fail closed')
assert.ok(source['app/data-quality/autonomous/page.tsx'].includes('canAgents ? <Link href={`/agents/runs/'), 'adversarial: unauthorized run evidence must fail closed')
assert.ok(source['app/classification-privacy/page.tsx'].includes('canCatalog ? <Link href="/catalog"'), 'adversarial: unauthorized Catalog navigation must fail closed')
assert.ok(source['app/lineage/ingest/page.tsx'].includes('canDiscovery ? <Link href="/catalog/discovery"'), 'adversarial: unauthorized Discovery navigation must fail closed')
assert.ok(source['app/monitoring/domain/[projectId]/page.tsx'].includes('canAgents && latestRun ? <Link href={`/agents/runs/'), 'adversarial: unauthorized domain output navigation must fail closed')
assert.ok(source['app/observability/incidents/page.tsx'].includes('canWorkflows?<Link href="/workflows"'), 'adversarial: unauthorized workflow navigation must fail closed')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source['app/monitoring/domain/[projectId]/page.tsx']), 'adversarial: Domain Monitoring page must remain read-only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source['app/observability/incidents/page.tsx']), 'adversarial: Observability Incidents page must remain read-only')

console.log('Independent Wave 10 UX adversarial audit passed.')
