import assert from 'node:assert/strict'
import fs from 'node:fs'

const files=[
  'scripts/test-product-shell-ux.mjs',
  'scripts/test-ux-shell-residual-inventory.mjs',
  'scripts/test-skip-link-bypass-contract.mjs',
  'scripts/test-ux-wave13-shell-residual-surfaces.mjs',
  'scripts/test-ux-wave13-local-navigation-policy.mjs',
  'scripts/test-ux-wave13-cta-inventory.mjs',
  'scripts/test-ux-wave13-negative-failure-cases.mjs',
  'scripts/audit-ux-wave13-adversarial.mjs',
]
for(const file of files) assert.ok(fs.existsSync(file),`post-implementation: required regression contract missing: ${file}`)

const nav=fs.readFileSync('.github/workflows/navigation-integrity.yml','utf8')
for(const marker of ['Wave 9','Wave 10','Wave 11','Wave 12','Wave 13']) assert.ok(nav.includes(marker),`post-implementation: navigation workflow missing ${marker}`)
assert.ok(nav.includes('Exact-head TypeScript revalidation'),'post-implementation: navigation workflow must retain exact-head TypeScript validation')
assert.ok(nav.includes('Exact-head production build'),'post-implementation: navigation workflow must retain exact-head production build')
console.log('Post-implementation regression-gate inventory passed.')
