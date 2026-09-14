import { createAdminClient } from '@/lib/supabase/admin'
import type { ApprovalAxis } from './agent-policy-v2'
import { getAgentActionProfile } from './agent-action-catalog'
import { authorizeDataset, authorizeProject } from '@/lib/auth/authorize'
import { canViewDatasetResource } from './resource-authorization'

export type ApprovalInboxItem = {
  request: Record<string, unknown>
  eligibleAxes: ApprovalAxis[]
  decisions: Record<string, unknown>[]
  isRequester: boolean
  canExecute: boolean
}

const clientRequestFields = [
  'id',
  'domain',
  'environment',
  'action_key',
  'target_type',
  'target_id',
  'risk_level',
  'business_criticality',
  'material_production_mutation',
  'policy_version',
  'status',
  'sla_due_at',
  'requested_at',
  'approved_at',
  'executed_at',
  'invalidated_at',
  'invalidation_reason',
  'requires_business_approval',
  'requires_governance_approval',
] as const

export function approvalRequestClientView(request: Record<string, unknown>) {
  return Object.fromEntries(clientRequestFields.map(key => [key, request[key] ?? null]))
}

function approvalDecisionClientView(decision: Record<string, unknown>) {
  return {
    id: decision.id ?? null,
    approval_axis: decision.approval_axis ?? null,
    decision: decision.decision ?? null,
    comment: decision.comment ?? null,
    channel: decision.channel ?? null,
    decided_at: decision.decided_at ?? null,
    delegated: Boolean(decision.on_behalf_of_user_id),
  }
}

async function canViewApprovalScope(userId: string, request: Record<string, unknown>) {
  try {
    if (String(request.target_type) === 'DATASET') {
      const datasetId = String(request.target_id ?? '')
      if (!datasetId || !await canViewDatasetResource(userId, datasetId)) return false
      await authorizeDataset(userId, datasetId, 'agent.view')
      return true
    }
    await authorizeProject(userId, String(request.project_id ?? ''), 'agent.view')
    return true
  } catch {
    return false
  }
}

export async function loadApprovalInbox(userId: string): Promise<ApprovalInboxItem[]> {
  const admin = createAdminClient()
  const { data: requests, error: requestError } = await admin.schema('governance')
    .from('agent_approval_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(100)
  if (requestError) throw new Error(`Unable to load approval requests: ${requestError.message}`)

  const visible: Array<{ request: Record<string, unknown>; eligibleAxes: ApprovalAxis[]; isRequester: boolean; canExecute: boolean }> = []

  for (const row of requests ?? []) {
    const request = row as Record<string, unknown>
    if (!await canViewApprovalScope(userId, request)) continue

    const isRequester = String(request.requested_by) === userId
    const eligibleAxes: ApprovalAxis[] = []

    for (const axis of ['BUSINESS','GOVERNANCE'] as const) {
      const required = axis === 'BUSINESS'
        ? request.requires_business_approval === true
        : request.requires_governance_approval === true
      if (!required) continue
      const { data, error } = await admin.schema('governance').rpc('is_agent_approval_authority', {
        p_user_id: userId,
        p_project_id: String(request.project_id),
        p_domain: String(request.domain ?? ''),
        p_axis: axis,
        p_action_key: String(request.action_key ?? ''),
        p_risk: String(request.risk_level ?? ''),
      })
      if (error) throw new Error(`Unable to evaluate approval authority: ${error.message}`)
      if (data === true) eligibleAxes.push(axis)
    }

    let canExecute = false
    if (String(request.status) === 'READY_TO_EXECUTE') {
      try {
        const profile = getAgentActionProfile(String(request.action_key ?? ''))
        if (String(request.target_type) === 'DATASET') {
          await authorizeDataset(userId, String(request.target_id ?? ''), profile.capability)
        } else {
          await authorizeProject(userId, String(request.project_id ?? ''), profile.capability)
        }
        canExecute = true
      } catch {
        canExecute = false
      }
    }

    if (isRequester || eligibleAxes.length > 0 || canExecute) visible.push({ request, eligibleAxes, isRequester, canExecute })
  }

  const ids = visible.map(item => String(item.request.id))
  const { data: decisions, error: decisionError } = ids.length
    ? await admin.schema('governance').from('agent_approval_decisions')
        .select('id,approval_request_id,approval_axis,on_behalf_of_user_id,decision,comment,channel,decided_at')
        .in('approval_request_id', ids)
        .order('decided_at')
    : { data: [], error: null }
  if (decisionError) throw new Error(`Unable to load approval decisions: ${decisionError.message}`)

  const byRequest = new Map<string, Record<string, unknown>[]>()
  for (const decision of decisions ?? []) {
    const key = String(decision.approval_request_id)
    byRequest.set(key, [...(byRequest.get(key) ?? []), approvalDecisionClientView(decision as Record<string, unknown>)])
  }

  return visible.map(item => ({
    ...item,
    request: approvalRequestClientView(item.request),
    decisions: byRequest.get(String(item.request.id)) ?? [],
  }))
}
