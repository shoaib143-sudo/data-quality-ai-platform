import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = [
  ['glossary', fs.readFileSync('app/glossary/page.tsx', 'utf8')],
  ['lineage', fs.readFileSync('app/lineage/page.tsx', 'utf8')],
  ['stewardship', fs.readFileSync('app/stewardship/page.tsx', 'utf8')],
  ['classification', fs.readFileSync('app/classification/page.tsx', 'utf8')],
  ['audit', fs.readFileSync('app/audit/page.tsx', 'utf8')],
  ['observability', fs.readFileSync('app/observability/page.tsx', 'utf8')],
]

for (const [name, source] of pages) {
  assert.ok(source.includes('<GlobalUtilityBar'), 'adversarial: ' + name + ' must not regress to an isolated shell')
  assert.ok(source.includes('organizationRole='), 'adversarial: ' + name + ' shell must receive organization-role context')
  assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source), 'adversarial: ' + name + ' page must not gain direct mutation authority')
}

const lineage = pages.find(([name]) => name === 'lineage')[1]
const observability = pages.find(([name]) => name === 'observability')[1]
const audit = pages.find(([name]) => name === 'audit')[1]

assert.ok(lineage.includes('canLineageManage?<Link href="/lineage/ingest"'), 'adversarial: Lineage ingest must remain manage-gated')
assert.ok(observability.includes('canProfiling?<Link href="/profiling/explorer"'), 'adversarial: Observability must not expose profiling without workspace access')
assert.ok(observability.includes('canManageWorkspace?<Link href="/observability/settings"'), 'adversarial: Observability settings must remain manage-gated')
assert.ok(audit.includes('canLineage?<Link href="/lineage"'), 'adversarial: Audit must not expose inaccessible Lineage navigation')

console.log('Independent Wave 5 UX adversarial audit passed.')
