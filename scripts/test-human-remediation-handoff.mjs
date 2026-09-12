import assert from 'node:assert/strict'
import { resolveHumanRemediationHandoff } from '../lib/governance/remediation-handoff.ts'

const authorized = resolveHumanRemediationHandoff({
  workflowInstanceId: 'workflow 123',
  canApprove: true,
})
assert.equal(authorized.kind, 'approval-workflow')
assert.equal(authorized.href, '/workflows?instanceId=workflow%20123')
assert.equal(authorized.label, 'Open approval workflow')

const unauthorized = resolveHumanRemediationHandoff({
  workflowInstanceId: 'workflow-123',
  canApprove: false,
})
assert.equal(unauthorized.kind, 'governed-handoff')
assert.equal(unauthorized.href, '/issues')
assert.match(unauthorized.guidance, /project approver with policy approval authority/i)
assert.match(unauthorized.guidance, /read only/i)
assert.equal(unauthorized.href.includes('/workflows'), false)

const noApproval = resolveHumanRemediationHandoff({
  workflowInstanceId: null,
  canApprove: false,
})
assert.equal(noApproval.kind, 'issue-tracking')
assert.equal(noApproval.href, '/issues')
assert.match(noApproval.guidance, /No approval workflow is required/i)

const blankWorkflow = resolveHumanRemediationHandoff({
  workflowInstanceId: '   ',
  canApprove: true,
})
assert.equal(blankWorkflow.kind, 'issue-tracking')
assert.equal(blankWorkflow.href, '/issues')

console.log('Human remediation handoff unit cases passed.')
