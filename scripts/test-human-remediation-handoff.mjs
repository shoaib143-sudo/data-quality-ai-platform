import assert from 'node:assert/strict'
import { resolveHumanRemediationHandoff } from '../lib/governance/remediation-handoff.ts'

const authorized = resolveHumanRemediationHandoff({
  workflowInstanceId: 'workflow 123',
  canApprove: true,
  canAccessApprovalWorkspace: true,
})
assert.equal(authorized.kind, 'approval-workflow')
assert.equal(authorized.href, '/workflows?instanceId=workflow%20123')
assert.equal(authorized.label, 'Open approval workflow')

const approvalWithoutWorkspace = resolveHumanRemediationHandoff({
  workflowInstanceId: 'workflow-123',
  canApprove: true,
  canAccessApprovalWorkspace: false,
})
assert.equal(approvalWithoutWorkspace.kind, 'governed-handoff')
assert.equal(approvalWithoutWorkspace.href, '/issues')
assert.match(approvalWithoutWorkspace.guidance, /workflows workspace is not available/i)
assert.match(approvalWithoutWorkspace.guidance, /authorized workflow operator/i)
assert.equal(approvalWithoutWorkspace.href.includes('/workflows'), false)

const unauthorized = resolveHumanRemediationHandoff({
  workflowInstanceId: 'workflow-123',
  canApprove: false,
  canAccessApprovalWorkspace: true,
})
assert.equal(unauthorized.kind, 'governed-handoff')
assert.equal(unauthorized.href, '/issues')
assert.match(unauthorized.guidance, /project approver with policy approval authority/i)
assert.match(unauthorized.guidance, /read only/i)
assert.equal(unauthorized.href.includes('/workflows'), false)

const noApproval = resolveHumanRemediationHandoff({
  workflowInstanceId: null,
  canApprove: false,
  canAccessApprovalWorkspace: false,
})
assert.equal(noApproval.kind, 'issue-tracking')
assert.equal(noApproval.href, '/issues')
assert.match(noApproval.guidance, /No approval workflow is required/i)

const blankWorkflow = resolveHumanRemediationHandoff({
  workflowInstanceId: '   ',
  canApprove: true,
  canAccessApprovalWorkspace: true,
})
assert.equal(blankWorkflow.kind, 'issue-tracking')
assert.equal(blankWorkflow.href, '/issues')

console.log('Human remediation handoff unit cases passed.')
