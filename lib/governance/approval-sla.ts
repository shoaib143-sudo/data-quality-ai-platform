import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueApprovalNotifications } from './approval-notifications'

type PendingRequest = {
  id: string
  requested_at: string
  sla_due_at: string
  status: string
}

async function alreadyQueued(requestId: string, eventType: 'REMINDER' | 'ESCALATED') {
  const admin = createAdminClient()
  const { count, error } = await admin.schema('governance').from('agent_approval_notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('approval_request_id', requestId)
    .eq('event_type', eventType)
    .neq('status', 'CANCELLED')
  if (error) throw new Error(`Unable to inspect approval escalation history: ${error.message}`)
  return (count ?? 0) > 0
}

export async function evaluateAgentApprovalSlaEscalations(limit = 100) {
  const admin = createAdminClient()
  const now = Date.now()
  const { data, error } = await admin.schema('governance').from('agent_approval_requests')
    .select('id,requested_at,sla_due_at,status')
    .in('status', ['REQUESTED','BUSINESS_PENDING','GOVERNANCE_PENDING','APPROVED'])
    .order('sla_due_at')
    .limit(limit)
  if (error) throw new Error(`Unable to load pending approval SLAs: ${error.message}`)

  const results: Array<Record<string, unknown>> = []
  for (const request of (data ?? []) as PendingRequest[]) {
    const requestedAt = new Date(request.requested_at).getTime()
    const dueAt = new Date(request.sla_due_at).getTime()
    if (!Number.isFinite(requestedAt) || !Number.isFinite(dueAt)) continue

    if (now >= dueAt) {
      if (!(await alreadyQueued(request.id, 'ESCALATED'))) {
        const queued = await enqueueApprovalNotifications(request.id, 'ESCALATED', {
          slaDueAt: request.sla_due_at,
          overdue: true,
        })
        results.push({ requestId: request.id, event: 'ESCALATED', ...queued })
      }
      continue
    }

    const reminderAt = requestedAt + Math.max(0, dueAt - requestedAt) / 2
    if (now >= reminderAt && !(await alreadyQueued(request.id, 'REMINDER'))) {
      const queued = await enqueueApprovalNotifications(request.id, 'REMINDER', {
        slaDueAt: request.sla_due_at,
        overdue: false,
      })
      results.push({ requestId: request.id, event: 'REMINDER', ...queued })
    }
  }

  return { evaluated: (data ?? []).length, emitted: results.length, results }
}
