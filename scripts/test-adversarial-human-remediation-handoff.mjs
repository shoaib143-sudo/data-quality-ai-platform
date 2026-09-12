import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const page = read('app/data-quality/autonomous/page.tsx')
const handoff = read('lib/governance/remediation-handoff.ts')
const remediationRoute = read('app/api/data-quality/remediation/route.ts')

assert.match(
  page,
  /hasProjectCapability\(user\.id, projectId, 'policy\.approve'\)/,
  'Data Quality remediation UI must derive approval visibility from the server-side policy.approve capability.',
)
assert.match(
  page,
  /canApprove:\s*policyApprovalAccess\.get\(investigation\.project_id\) === true/,
  'Each investigation must resolve its handoff against that investigation project capability.',
)
assert.match(
  page,
  /href=\{handoff\.href\}/,
  'Workflow-backed remediation navigation must use the deterministic handoff resolver.',
)
assert.doesNotMatch(
  page,
  /investigation\.workflow_instance_id\s*\?[^\n]*<Link href="\/workflows"/,
  'Workflow-backed investigations must not unconditionally route users into the governance operator console.',
)
assert.match(
  page,
  /hasAnyPolicyApprovalAccess\s*\?\s*<Link href="\/workflows"/,
  'The global approvals entry must remain capability gated.',
)

assert.match(
  handoff,
  /if \(input\.canApprove\)[\s\S]*href: `\/workflows\?instanceId=\$\{encodeURIComponent\(workflowInstanceId\)\}`/,
  'Only an authorized approver may receive the focused workflow URL and the workflow id must be encoded.',
)
assert.match(
  handoff,
  /kind: 'governed-handoff'[\s\S]*href: '\/issues'/,
  'Unauthorized workflow-backed remediation must fail closed to the governed issue path.',
)
assert.match(
  handoff,
  /project approver with policy approval authority/i,
  'Unauthorized users must receive explicit human approval guidance.',
)
assert.match(
  handoff,
  /read only/i,
  'Unauthorized users must be told that their access remains read only.',
)

assert.match(
  remediationRoute,
  /if \(instance\.status !== 'APPROVED'\) return NextResponse\.json\(\{ error: 'Data quality remediation requires an approved workflow\.' \}, \{ status: 409 \}\)/,
  'The remediation API must continue rejecting non-approved workflows.',
)
assert.match(
  remediationRoute,
  /production_mutation_performed: false/,
  'Persisted remediation outcomes must continue recording that no production mutation occurred.',
)
assert.match(
  remediationRoute,
  /productionMutationPerformed: false/,
  'Remediation API responses must continue reporting that no production mutation occurred.',
)
assert.doesNotMatch(
  remediationRoute,
  /production_mutation_performed:\s*true|productionMutationPerformed:\s*true/,
  'The remediation path must not introduce a production mutation success state.',
)

console.log('Adversarial human remediation handoff audit passed.')
