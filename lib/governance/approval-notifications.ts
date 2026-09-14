import { createAdminClient } from '@/lib/supabase/admin'
import type { ApprovalChannel } from './agent-approval-service'

export type ApprovalNotificationEvent = 'REQUESTED' | 'REMINDER' | 'ESCALATED' | 'DECIDED'

const channels: readonly ApprovalChannel[] = ['DATANEXUS', 'EMAIL', 'TEAMS']

type EligibleRecipient = { userId: string; axis: 'BUSINESS' | 'GOVERNANCE' }

async function eligibleRecipients(request: Record<string, unknown>): Promise<EligibleRecipient[]> {
  const admin = createAdminClient()
  const projectId = String(request.project_id ?? '')
  const domain = String(request.domain ?? '')
  const actionKey = String(request.action_key ?? '')
  const risk = String(request.risk_level ?? '')
  const recipients = new Map<string, EligibleRecipient>()

  const { data: authorities, error: authorityError } = await admin.schema('governance')
    .from('agent_approval_authorities')
    .select('user_id,approval_axis,project_id,domain,active,starts_at,ends_at')
    .eq('active', true)
  if (authorityError) throw new Error(`Unable to resolve approval notification recipients: ${authorityError.message}`)

  const now = Date.now()
  for (const row of authorities ?? []) {
    if (String(row.domain ?? '').toLowerCase() !== domain.toLowerCase()) continue
    if (row.project_id && String(row.project_id) !== projectId) continue
    const starts = new Date(String(row.starts_at)).getTime()
    const ends = row.ends_at ? new Date(String(row.ends_at)).getTime() : null
    if (Number.isFinite(starts) && starts > now) continue
    if (ends !== null && Number.isFinite(ends) && ends <= now) continue
    const axis = String(row.approval_axis) as 'BUSINESS' | 'GOVERNANCE'
    if (axis === 'BUSINESS' && request.requires_business_approval !== true) continue
    if (axis === 'GOVERNANCE' && request.requires_governance_approval !== true) continue
    recipients.set(`${row.user_id}:${axis}`, { userId: String(row.user_id), axis })
  }

  const { data: delegations, error: delegationError } = await admin.schema('governance')
    .from('agent_approval_delegations')
    .select('delegate_user_id,approval_axis,domain,project_id,action_keys,max_risk,active,starts_at,ends_at')
    .eq('active', true)
  if (delegationError) throw new Error(`Unable to resolve delegated approval notification recipients: ${delegationError.message}`)

  const rank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
  for (const row of delegations ?? []) {
    if (String(row.domain ?? '').toLowerCase() !== domain.toLowerCase()) continue
    if (row.project_id && String(row.project_id) !== projectId) continue
    const actionKeys = Array.isArray(row.action_keys) ? row.action_keys.map(String) : []
    if (actionKeys.length && !actionKeys.includes(actionKey)) continue
    if ((rank[risk] ?? 99) > (rank[String(row.max_risk)] ?? -1)) continue
    const starts = new Date(String(row.starts_at)).getTime()
    const ends = row.ends_at ? new Date(String(row.ends_at)).getTime() : null
    if (Number.isFinite(starts) && starts > now) continue
    if (ends !== null && Number.isFinite(ends) && ends <= now) continue
    const axis = String(row.approval_axis)
    if (axis === 'BUSINESS' && request.requires_business_approval !== true) continue
    if (axis === 'GOVERNANCE' && request.requires_governance_approval !== true) continue
    const delegatedAxis = String(row.approval_axis) as 'BUSINESS' | 'GOVERNANCE'
    recipients.set(`${row.delegate_user_id}:${delegatedAxis}`, { userId: String(row.delegate_user_id), axis: delegatedAxis })
  }

  return [...recipients.values()]
}

export async function enqueueApprovalNotifications(
  approvalRequestId: string,
  eventType: ApprovalNotificationEvent,
  extraPayload: Record<string, unknown> = {},
) {
  const admin = createAdminClient()
  const { data: request, error } = await admin.schema('governance').from('agent_approval_requests')
    .select('*')
    .eq('id', approvalRequestId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load approval request for notification: ${error.message}`)
  if (!request) throw new Error('Approval request was not found for notification.')

  const recipients = await eligibleRecipients(request as Record<string, unknown>)
  if (!recipients.length) return { queued: 0, recipients: 0 }

  const rows = recipients.flatMap(recipient => channels.map(channel => ({
    approval_request_id: approvalRequestId,
    recipient_user_id: recipient.userId,
    channel,
    event_type: eventType,
    payload: {
      approvalRequestId,
      approvalAxis: recipient.axis,
      actionKey: request.action_key,
      domain: request.domain,
      riskLevel: request.risk_level,
      status: request.status,
      slaDueAt: request.sla_due_at,
      approvalsUrl: `/approvals?request=${encodeURIComponent(approvalRequestId)}`,
      ...extraPayload,
    },
  })))

  const { error: insertError } = await admin.schema('governance').from('agent_approval_notification_outbox').insert(rows)
  if (insertError) throw new Error(`Unable to enqueue approval notifications: ${insertError.message}`)
  return { queued: rows.length, recipients: recipients.length }
}
