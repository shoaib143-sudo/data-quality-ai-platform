export type HumanRemediationHandoff = {
  kind: 'approval-workflow' | 'governed-handoff' | 'issue-tracking'
  href: string
  label: string
  guidance: string
}

export function resolveHumanRemediationHandoff(input: {
  workflowInstanceId: string | null
  canApprove: boolean
  canAccessApprovalWorkspace: boolean
}): HumanRemediationHandoff {
  const workflowInstanceId = input.workflowInstanceId?.trim() || null

  if (!workflowInstanceId) {
    return {
      kind: 'issue-tracking',
      href: '/issues',
      label: 'Open remediation issues',
      guidance: 'No approval workflow is required. Track governed remediation and verification evidence in Issues.',
    }
  }

  if (input.canApprove && input.canAccessApprovalWorkspace) {
    return {
      kind: 'approval-workflow',
      href: `/workflows?instanceId=${encodeURIComponent(workflowInstanceId)}`,
      label: 'Open approval workflow',
      guidance: 'You have the active approval capability and workspace access for this governed remediation request.',
    }
  }

  if (input.canApprove) {
    return {
      kind: 'governed-handoff',
      href: '/issues',
      label: 'Track remediation issue',
      guidance: 'You have approval authority, but the Governance Workflows workspace is not available in your current governance context. Track the remediation issue and coordinate the approval with an authorized workflow operator.',
    }
  }

  return {
    kind: 'governed-handoff',
    href: '/issues',
    label: 'Track remediation issue',
    guidance: 'Approval is required from a project approver with policy approval authority. Your access remains read only until that approval is completed.',
  }
}
