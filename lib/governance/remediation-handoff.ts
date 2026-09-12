export type HumanRemediationHandoff = {
  kind: 'approval-workflow' | 'governed-handoff' | 'issue-tracking'
  href: string
  label: string
  guidance: string
}

export function resolveHumanRemediationHandoff(input: {
  workflowInstanceId: string | null
  canApprove: boolean
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

  if (input.canApprove) {
    return {
      kind: 'approval-workflow',
      href: `/workflows?instanceId=${encodeURIComponent(workflowInstanceId)}`,
      label: 'Open approval workflow',
      guidance: 'You have the active approval capability for this governed remediation request.',
    }
  }

  return {
    kind: 'governed-handoff',
    href: '/issues',
    label: 'Track remediation issue',
    guidance: 'Approval is required from a project approver with policy approval authority. Your access remains read only until that approval is completed.',
  }
}
