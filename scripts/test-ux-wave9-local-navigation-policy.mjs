import assert from 'node:assert/strict'
import fs from 'node:fs'

const physical=fs.readFileSync('app/catalog/physical-assets/page.tsx','utf8')
const rules=fs.readFileSync('app/data-quality/rules/page.tsx','utf8')
const exceptions=fs.readFileSync('app/data-quality/exceptions/page.tsx','utf8')
const impact=fs.readFileSync('app/lineage/impact/page.tsx','utf8')

assert.ok(physical.includes("canAccessWorkspace(landing.persona, 'discovery'"), 'Physical Assets Discovery CTA must derive from workspace policy')
assert.ok(physical.includes('canDiscovery ? <Link href="/catalog/discovery"'), 'Physical Assets must hide Discovery when inaccessible')
assert.ok(rules.includes("canAccessWorkspace(landing.persona,'monitoring'"), 'DQ Rules Job Monitor CTA must derive from workspace policy')
assert.ok(rules.includes('canMonitoring?<Link href="/monitoring"'), 'DQ Rules must hide Job Monitor when inaccessible')
assert.ok(exceptions.includes("canAccessWorkspace(landing.persona,'monitoring'"), 'DQ Exceptions Job Monitor CTA must derive from workspace policy')
assert.ok(exceptions.includes('canMonitoring?<Link href="/monitoring"'), 'DQ Exceptions must hide Job Monitor when inaccessible')
assert.ok(impact.includes("canAccessWorkspace(landing.persona,'observability'"), 'Lineage Impact Operations CTA must derive from workspace policy')
assert.ok(impact.includes('canObservability?<Link href="/observability/incidents"'), 'Lineage Impact must hide Operations Center when inaccessible')

console.log('Wave 9 local-navigation policy contract passed.')
