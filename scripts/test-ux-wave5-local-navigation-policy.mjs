import assert from 'node:assert/strict'
import fs from 'node:fs'

const glossary = fs.readFileSync('app/glossary/page.tsx', 'utf8')
const lineage = fs.readFileSync('app/lineage/page.tsx', 'utf8')
const stewardship = fs.readFileSync('app/stewardship/page.tsx', 'utf8')
const classification = fs.readFileSync('app/classification/page.tsx', 'utf8')
const audit = fs.readFileSync('app/audit/page.tsx', 'utf8')
const observability = fs.readFileSync('app/observability/page.tsx', 'utf8')

assert.ok(glossary.includes("canAccessWorkspace(landing.persona, 'catalog'"), 'Glossary Catalog CTA must derive from workspace policy')
assert.ok(glossary.includes('canCatalog ? <Link href="/catalog"'), 'Glossary Catalog CTA must fail closed')
assert.ok(stewardship.includes("canAccessWorkspace(landing.persona, 'catalog'"), 'Stewardship Catalog CTA must derive from workspace policy')
assert.ok(stewardship.includes('canCatalog ? <Link href="/catalog"'), 'Stewardship Catalog CTA must fail closed')
assert.ok(classification.includes("canAccessWorkspace(landing.persona,'catalog'"), 'Classification Catalog CTA must derive from workspace policy')
assert.ok(classification.includes('canCatalog?<Link href="/catalog"'), 'Classification Catalog CTA must fail closed')

assert.ok(audit.includes("canAccessWorkspace(landing.persona,'lineage'"), 'Audit Lineage CTA must derive from workspace policy')
assert.ok(audit.includes('canLineage?<Link href="/lineage"'), 'Audit Lineage CTA must fail closed')

assert.ok(lineage.includes("canAccessWorkspace(landing.persona,'catalog'"), 'Lineage Catalog CTA must derive from workspace policy')
assert.ok(lineage.includes("canAccessWorkspace(landing.persona,'glossary'"), 'Lineage Glossary CTA must derive from workspace policy')
assert.ok(lineage.includes("canAccessWorkspace(landing.persona,'data-quality'"), 'Lineage Data Quality CTA must derive from workspace policy')
assert.ok(lineage.includes("canAccessWorkspace(landing.persona,'lineage-manage'"), 'Lineage ingest CTA must derive from manage policy')
assert.ok(lineage.includes('canLineageManage?<Link href="/lineage/ingest"'), 'Lineage ingest must remain manage-gated')

assert.ok(observability.includes("canAccessWorkspace(landing.persona,'datasets'"), 'Observability Datasets CTA must derive from workspace policy')
assert.ok(observability.includes("canAccessWorkspace(landing.persona,'monitoring'"), 'Observability Job Monitor CTA must derive from workspace policy')
assert.ok(observability.includes("canAccessWorkspace(landing.persona,'data-quality'"), 'Observability Data Quality CTA must derive from workspace policy')
assert.ok(observability.includes("canAccessWorkspace(landing.persona,'profiling'"), 'Observability Profiling CTA must derive from workspace policy')
assert.ok(observability.includes("canAccessWorkspace(landing.persona,'observability-manage'"), 'Observability Settings CTA must derive from manage policy')
assert.ok(observability.includes('canProfiling?<Link href="/profiling/explorer"'), 'Observability Profiling CTA must fail closed')
assert.ok(observability.includes('canManageWorkspace?<Link href="/observability/settings"'), 'Observability Settings CTA must fail closed')

console.log('Wave 5 local navigation policy contract passed.')
