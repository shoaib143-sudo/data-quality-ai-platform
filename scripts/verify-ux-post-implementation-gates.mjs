import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflowPath='.github/workflows/navigation-integrity.yml'
const workflow=fs.readFileSync(workflowPath,'utf8')
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'))

const requiredWorkflowPaths=[
  "'scripts/verify-ux-post-implementation-gates.mjs'",
  "'scripts/test-ux-wave13-shell-final-residuals.mjs'",
  "'scripts/test-ux-wave13-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave13-cta-inventory.mjs'",
  "'scripts/test-ux-wave13-authorization-negative-cases.mjs'",
  "'scripts/audit-ux-wave13-adversarial.mjs'",
  "'lib/auth/safe-auth-return-path.ts'",
  "'tests/safe-auth-return-path.test.mjs'",
]

for(const requiredPath of requiredWorkflowPaths){
  const matches=workflow.split(requiredPath).length-1
  assert.ok(matches>=2, `post-implementation gate path must trigger on PR and main push: ${requiredPath}`)
}

for(const wave of [9,10,11,12,13]){
  const labels=[
    `Wave ${wave}`,
    wave===13?'CTA inventory and destinations':'CTA inventory and destinations',
    'adversarial audit',
  ]
  for(const label of labels){
    assert.ok(workflow.includes(label), `Navigation Integrity must retain Wave ${wave} post-implementation coverage for ${label}`)
  }
}

const requiredSteps=[
  'Test Wave 13 final residual Product Shell surfaces',
  'Test Wave 13 local navigation policy',
  'Test Wave 13 CTA inventory and destinations',
  'Test Wave 13 authorization negative and failure cases',
  'Test safe auth return-path unit and negative cases',
  'Run independent Wave 13 adversarial audit',
  'Verify post-implementation UX gate matrix',
  'Revalidate profiling lifecycle',
  'Revalidate remediation lifecycle',
  'Exact-head TypeScript revalidation',
  'Exact-head production build',
]
for(const step of requiredSteps){
  assert.ok(workflow.includes(`- name: ${step}`), `Navigation Integrity must retain required post-implementation step: ${step}`)
}

const verifyScript=packageJson.scripts?.['verify:ux-closure-post-implementation']
assert.equal(typeof verifyScript,'string','package.json must expose verify:ux-closure-post-implementation')
for(const command of [
  'verify-ux-post-implementation-gates.mjs',
  'test-ux-wave13-shell-final-residuals.mjs',
  'test-ux-wave13-local-navigation-policy.mjs',
  'test-ux-wave13-cta-inventory.mjs',
  'test-ux-wave13-authorization-negative-cases.mjs',
  'safe-auth-return-path.test.mjs',
  'audit-ux-wave13-adversarial.mjs',
  'verify-profiling-lifecycle-contracts.mjs',
  'verify-profiling-remediation.mjs',
  'tsc --noEmit',
  'pnpm run build',
]){
  assert.ok(verifyScript.includes(command), `local post-implementation verifier must retain: ${command}`)
}

console.log('UX post-implementation gate matrix contract passed.')
