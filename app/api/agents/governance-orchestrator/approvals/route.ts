import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  currentExecutionFingerprint,
  loadApprovalDelegationWorkspace,
  markApprovalExecuted,
  recordAgentApprovalDecision,
  validateApprovalForExecution,
  type ApprovalDecision,
} from '@/lib/governance/agent-approval-service'
import {
  approvalParameters,
  rejectGovernanceOrchestratorApproval,
  resumeGovernanceOrchestratorAfterApproval,
} from '@/lib/orchestration/governance-orchestrator-approval-service'

const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function currentAxis(status: string): 'BUSINESS' | 'GOVERNANCE' | null {
  if (status === 'BUSINESS_PENDING') return 'BUSINESS'
  if (status === 'GOVERNANCE_PENDING') return 'GOVERNANCE'
  return null
}

function authorityMatches(input: {
  workspace: Awaited<ReturnType<typeof loadApprovalDelegationWorkspace>>
  userId: string
  projectId: string
  domain: string
  actionKey: string
  riskLevel: string
  axis: 'BUSINESS' | 'GOVERNANCE' | null
}) {
  if (!input.axis) return false
  const now = Date.now()
  const direct = input.workspace.authorities.some(row => {
    const project = row.project_id ? String(row.project_id) : null
    return String(row.approval_axis) === input.axis
      && (!project || project === input.projectId)
      && (!row.domain || String(row.domain) === input.domain)
  })
  if (direct) return true
  return input.workspace.delegations.some(row => {
    if (String(row.delegate_user_id) !== input.userId || row.active !== true || row.revoked_at) return false
    if (String(row.approval_axis) !== input.axis) return false
    if (row.project_id && String(row.project_id) !== input.projectId) return false
    if (row.domain && String(row.domain) !== input.domain) return false
    const starts = new Date(String(row.starts_at)).getTime()
    const ends = row.ends_at ? new Date(String(row.ends_at)).getTime() : Number.POSITIVE_INFINITY
    if (!Number.isFinite(starts) || now < starts || now >= ends) return false
    const actions = Array.isArray(row.action_keys) ? row.action_keys.map(String) : []
    if (!actions.includes(input.actionKey)) return false
    const requestRisk = rank[input.riskLevel as keyof typeof rank]
    const maximumRisk = rank[String(row.max_risk) as keyof typeof rank]
    return requestRisk !== undefined && maximumRisk !== undefined && requestRisk <= maximumRisk
  })
}

async function loadApproval(requestId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('agent_approval_requests').select('*').eq('id', requestId).maybeSingle()
  if (error) throw new Error(`Unable to load approval request: ${error.message}`)
  if (!data) throw new Error('Approval request was not found.')
  return data as Record<string, unknown>
}

function approvalView(row: Record<string, unknown>, canDecide: boolean, requester: string | null) {
  const parameters = approvalParameters(row)
  const payload = safeObject(row.fingerprint_payload)
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    orchestratorRunId: text(parameters.orchestratorRunId),
    actionKey: String(row.action_key),
    riskLevel: String(row.risk_level),
    status: String(row.status),
    approvalAxis: currentAxis(String(row.status)),
    policyVersion: String(row.policy_version ?? ''),
    orchestratorPolicyVersion: text(parameters.policyVersion),
    autonomyMode: text(parameters.autonomyMode),
    executionFingerprint: String(row.execution_fingerprint ?? ''),
    goalHash: text(parameters.goalHash),
    requestedBy: String(row.requested_by),
    requester,
    domain: String(row.domain ?? ''),
    targetType: String(row.target_type ?? ''),
    targetId: String(row.target_id ?? ''),
    requiresBusinessApproval: row.requires_business_approval === true,
    requiresGovernanceApproval: row.requires_governance_approval === true,
    createdAt: row.created_at ?? null,
    slaDueAt: row.sla_due_at ?? null,
    approvalExpiresAt: row.approval_expires_at ?? null,
    context: payload,
    canDecide,
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const projectId = text(new URL(request.url).searchParams.get('projectId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('agent_approval_requests')
      .select('*')
      .eq('project_id', projectId)
      .eq('action_key', 'RUN_SUPERVISOR')
      .in('status', ['BUSINESS_PENDING','GOVERNANCE_PENDING','READY_TO_EXECUTE'])
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(`Unable to load orchestrator approvals: ${error.message}`)

    const workspace = await loadApprovalDelegationWorkspace(user.id)
    const requesterIds = [...new Set((data ?? []).map(row => String(row.requested_by)).filter(Boolean))]
    const requesterLabels = new Map<string,string>()
    if (requesterIds.length) {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (!usersError) for (const account of users.users) if (requesterIds.includes(account.id)) requesterLabels.set(account.id, account.email ?? account.id)
    }

    return NextResponse.json({
      approvals: (data ?? []).map(row => {
        const axis = currentAxis(String(row.status))
        const canDecide = authorityMatches({
          workspace,
          userId: user.id,
          projectId,
          domain: String(row.domain ?? ''),
          actionKey: String(row.action_key),
          riskLevel: String(row.risk_level),
          axis,
        })
        return approvalView(row as Record<string, unknown>, canDecide, requesterLabels.get(String(row.requested_by)) ?? null)
      }),
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load orchestrator approvals.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const approvalRequestId = text(body?.approvalRequestId ?? body?.approval_request_id)
    const decision = text(body?.decision) as ApprovalDecision
    const comment = text(body?.comment)
    const goal = text(body?.goal)
    if (!projectId || !approvalRequestId) return NextResponse.json({ error: 'projectId and approvalRequestId are required.' }, { status: 400 })
    if (!['APPROVED','REJECTED'].includes(decision)) return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    if (!comment) return NextResponse.json({ error: 'Approval comment is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')

    const approval = await loadApproval(approvalRequestId)
    if (String(approval.project_id) !== projectId || String(approval.action_key) !== 'RUN_SUPERVISOR') {
      return NextResponse.json({ error: 'Approval request is outside this orchestrator project/action scope.' }, { status: 404 })
    }
    const parameters = approvalParameters(approval)
    const orchestratorRunId = text(parameters.orchestratorRunId)
    if (!orchestratorRunId) return NextResponse.json({ error: 'Approval request is missing its exact orchestrator run binding.' }, { status: 409 })

    const axis = currentAxis(String(approval.status))
    if (!axis) {
      if (String(approval.status) !== 'READY_TO_EXECUTE' || decision !== 'APPROVED') {
        return NextResponse.json({ error: `Approval request is not awaiting a decision. Current status: ${String(approval.status)}.` }, { status: 409 })
      }
    } else {
      const workspace = await loadApprovalDelegationWorkspace(user.id)
      const canDecide = authorityMatches({
        workspace,
        userId: user.id,
        projectId,
        domain: String(approval.domain ?? ''),
        actionKey: String(approval.action_key),
        riskLevel: String(approval.risk_level),
        axis,
      })
      if (!canDecide) return NextResponse.json({ error: `You do not hold current ${axis.toLowerCase()} approval authority for this request.` }, { status: 403 })
      await recordAgentApprovalDecision({
        requestId: approvalRequestId,
        approverUserId: user.id,
        axis,
        decision,
        comment,
        channel: 'DATANEXUS',
      })
    }

    const updatedApproval = await loadApproval(approvalRequestId)
    if (decision === 'REJECTED') {
      const runtime = await rejectGovernanceOrchestratorApproval({
        projectId,
        orchestratorRunId,
        approvalRequestId,
        reviewerUserId: user.id,
        comment,
      })
      return NextResponse.json({ approval: approvalView(updatedApproval, false, null), runtime })
    }

    if (String(updatedApproval.status) !== 'READY_TO_EXECUTE') {
      return NextResponse.json({
        approval: approvalView(updatedApproval, false, null),
        status: 'WAITING_APPROVAL',
        message: `Another governed approval axis remains pending: ${String(updatedApproval.status)}.`,
      }, { status: 202 })
    }
    if (!goal) return NextResponse.json({ error: 'The original execution goal is required to resume this exact paused run.' }, { status: 409 })

    const expectedGoalHash = text(parameters.goalHash)
    const actualGoalHash = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(goal).digest('hex'))
    if (!expectedGoalHash || actualGoalHash !== expectedGoalHash) {
      return NextResponse.json({ error: 'Execution goal does not match the approved request fingerprint. Resume denied.' }, { status: 409 })
    }

    const currentFingerprint = await currentExecutionFingerprint({ requestId: approvalRequestId, parameters })
    await validateApprovalForExecution({
      requestId: approvalRequestId,
      executorUserId: user.id,
      currentFingerprint,
      expectedActionKey: 'RUN_SUPERVISOR',
    })
    const runtime = await resumeGovernanceOrchestratorAfterApproval({
      projectId,
      orchestratorRunId,
      approvalRequestId,
      reviewerUserId: user.id,
      goal,
    })
    await markApprovalExecuted(approvalRequestId)
    return NextResponse.json({ approval: approvalView(await loadApproval(approvalRequestId), false, null), runtime })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to resolve orchestrator approval.' }, { status: 500 })
  }
}
