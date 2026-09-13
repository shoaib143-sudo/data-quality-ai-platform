import { createAdminClient } from '@/lib/supabase/admin'
import type { ApprovalAxis } from './agent-policy-v2'
import { getAgentActionProfile } from './agent-action-catalog'
import { authorizeDataset, authorizeProject } from '@/lib/auth/authorize'

export type ApprovalInboxItem = {
  request: Record<string, unknown>
  eligibleAxes: ApprovalAxis[]
  decisions: Record<string, unknown>[]
  isRequester: boolean
  canExecute: boolean
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
        .select('id,approval_request_id,approval_axis,approver_user_id,on_behalf_of_user_id,decision,comment,channel,decided_at')
        .in('approval_request_id', ids)
        .order('decided_at')
    : { data: [], error: null }
  if (decisionError) throw new Error(`Unable to load approval decisions: ${decisionError.message}`)

  const byRequest = new Map<string, Record<string, unknown>[]>()
  for (const decision of decisions ?? []) {
    const key = String(decision.approval_request_id)
    byRequest.set(key, [...(byRequest.get(key) ?? []), decision as Record<string, unknown>])
  }

  return visible.map(item => ({
    ...item,
    decisions: byRequest.get(String(item.request.id)) ?? [],
  }))
}
