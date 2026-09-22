import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflowPath='.github/workflows/navigation-integrity.yml'
const workflow=fs.readFileSync(workflowPath,'utf8')
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'))

const requiredWorkflowPaths=[
  "'scripts/verify-ux-post-implementation-gates.mjs'",
  "'scripts/test-ux-experience-wave1-integration.mjs'",
  "'scripts/test-ux-interaction-telemetry-v2.mjs'",
  "'scripts/audit-ux-experience-wave1-adversarial.mjs'",
  "'scripts/test-ux-wave9-shell-residual-governance.mjs'",
  "'scripts/test-ux-wave9-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave9-cta-inventory.mjs'",
  "'scripts/audit-ux-wave9-adversarial.mjs'",
  "'scripts/test-ux-wave10-shell-operational-surfaces.mjs'",
  "'scripts/test-ux-wave10-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave10-cta-inventory.mjs'",
  "'scripts/audit-ux-wave10-adversarial.mjs'",
  "'scripts/test-ux-wave11-shell-admin-control-plane.mjs'",
  "'scripts/test-ux-wave11-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave11-cta-inventory.mjs'",
  "'scripts/audit-ux-wave11-adversarial.mjs'",
  "'scripts/test-ux-wave12-shell-ai-command-center.mjs'",
  "'scripts/test-ux-wave12-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave12-cta-inventory.mjs'",
  "'scripts/audit-ux-wave12-adversarial.mjs'",
  "'scripts/test-ux-wave13-shell-final-residuals.mjs'",
  "'scripts/test-ux-wave13-local-navigation-policy.mjs'",
  "'scripts/test-ux-wave13-cta-inventory.mjs'",
  "'scripts/test-ux-wave13-authorization-negative-cases.mjs'",
  "'scripts/audit-ux-wave13-adversarial.mjs'",
  "'lib/auth/safe-auth-return-path.ts'",
  "'tests/safe-auth-return-path.test.mjs'"
]

for(const requiredPath of requiredWorkflowPaths){
  const matches=workflow.split(requiredPath).length-1
  assert.ok(matches>=2, `post-implementation gate path must trigger on PR and main push: ${requiredPath}`)
}

const requiredSteps=[
  "Test Wave 9 residual governance Product Shell surfaces",
  "Test Wave 9 local navigation policy",
  "Test Wave 9 CTA inventory and destinations",
  "Run independent Wave 9 adversarial audit",
  "Test Wave 10 operational Product Shell surfaces",
  "Test Wave 10 local navigation policy",
  "Test Wave 10 CTA inventory and destinations",
  "Run independent Wave 10 adversarial audit",
  "Test Wave 11 admin control-plane Product Shell surfaces",
  "Test Wave 11 local navigation policy",
  "Test Wave 11 CTA inventory and destinations",
  "Run independent Wave 11 adversarial audit",
  "Test Wave 12 AI Command Center Product Shell surfaces",
  "Test Wave 12 local navigation policy",
  "Test Wave 12 CTA inventory and destinations",
  "Run independent Wave 12 adversarial audit",
  "Test Wave 13 final residual Product Shell surfaces",
  "Test Wave 13 local navigation policy",
  "Test Wave 13 CTA inventory and destinations",
  "Test Wave 13 authorization negative and failure cases",
  "Test safe auth return-path unit and negative cases",
  "Test shared form interaction contract",
  "Run independent Wave 13 adversarial audit",
  "Test UX Experience Wave 1 integration contract",
  "Test UX interaction telemetry v2 negative cases",
  "Run independent UX Experience Wave 1 adversarial audit",
  "Verify post-implementation UX gate matrix",
  "Revalidate profiling lifecycle",
  "Revalidate remediation lifecycle",
  "Exact-head TypeScript revalidation",
  "Exact-head production build"
]
for(const step of requiredSteps){
  assert.ok(workflow.includes(`- name: ${step}`), `Navigation Integrity must retain required post-implementation step: ${step}`)
}

const verifyScript=packageJson.scripts?.['verify:ux-closure-post-implementation']
assert.equal(typeof verifyScript,'string','package.json must expose verify:ux-closure-post-implementation')

const requiredCommands=[
  "verify-ux-post-implementation-gates.mjs",
  "test-ux-experience-wave1-integration.mjs",
  "test-ux-interaction-telemetry-v2.mjs",
  "audit-ux-experience-wave1-adversarial.mjs",
  "test-ux-wave9-shell-residual-governance.mjs",
  "test-ux-wave9-local-navigation-policy.mjs",
  "test-ux-wave9-cta-inventory.mjs",
  "audit-ux-wave9-adversarial.mjs",
  "test-ux-wave10-shell-operational-surfaces.mjs",
  "test-ux-wave10-local-navigation-policy.mjs",
  "test-ux-wave10-cta-inventory.mjs",
  "audit-ux-wave10-adversarial.mjs",
  "test-ux-wave11-shell-admin-control-plane.mjs",
  "test-ux-wave11-local-navigation-policy.mjs",
  "test-ux-wave11-cta-inventory.mjs",
  "audit-ux-wave11-adversarial.mjs",
  "test-ux-wave12-shell-ai-command-center.mjs",
  "test-ux-wave12-local-navigation-policy.mjs",
  "test-ux-wave12-cta-inventory.mjs",
  "audit-ux-wave12-adversarial.mjs",
  "test-ux-wave13-shell-final-residuals.mjs",
  "test-ux-wave13-local-navigation-policy.mjs",
  "test-ux-wave13-cta-inventory.mjs",
  "test-ux-wave13-authorization-negative-cases.mjs",
  "safe-auth-return-path.test.mjs",
  "test-ux-shared-form-interaction-contract.mjs",
  "audit-ux-wave13-adversarial.mjs",
  "verify-profiling-lifecycle-contracts.mjs",
  "verify-profiling-remediation.mjs",
  "tsc --noEmit",
  "pnpm run build"
]
for(const command of requiredCommands){
  assert.ok(verifyScript.includes(command), `local post-implementation verifier must retain: ${command}`)
}

console.log('UX post-implementation gate matrix contract passed for Waves 9-13 and Experience Wave 1.')
