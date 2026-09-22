import assert from 'node:assert/strict'
import fs from 'node:fs'

const paths=[
  'app/catalog/discovery/page.tsx',
  'app/catalog/physical-assets/page.tsx',
  'app/data-quality/rules/page.tsx',
  'app/data-quality/exceptions/page.tsx',
  'app/lineage/impact/page.tsx',
  'app/lineage/suggestions/page.tsx',
]
const source=Object.fromEntries(paths.map(path=>[path,fs.readFileSync(path,'utf8')]))

for(const path of paths){
  assert.ok(source[path].includes('<GlobalUtilityBar'), `adversarial: ${path} must use shared shell`)
  assert.ok(source[path].includes('id="main-content"'), `adversarial: ${path} must preserve skip target`)
}

assert.ok(!source['app/catalog/discovery/page.tsx'].includes('Data Governance PowerHouse'), 'adversarial: Discovery must not preserve legacy top-level branding')
assert.ok(source['app/catalog/physical-assets/page.tsx'].includes('canDiscovery ? <Link href="/catalog/discovery"'), 'adversarial: unauthorized Discovery CTA must fail closed')
assert.ok(source['app/data-quality/rules/page.tsx'].includes('canMonitoring?<Link href="/monitoring"'), 'adversarial: unauthorized Job Monitor CTA must fail closed in DQ Rules')
assert.ok(source['app/data-quality/exceptions/page.tsx'].includes('canMonitoring?<Link href="/monitoring"'), 'adversarial: unauthorized Job Monitor CTA must fail closed in DQ Exceptions')
assert.ok(source['app/lineage/impact/page.tsx'].includes('canObservability?<Link href="/observability/incidents"'), 'adversarial: unauthorized Operations Center CTA must fail closed')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source['app/lineage/impact/page.tsx']), 'adversarial: Lineage Impact presentation page must remain read-only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source['app/catalog/discovery/page.tsx']), 'adversarial: Discovery presentation page must not add mutation authority')

console.log('Independent Wave 9 UX adversarial audit passed.')
