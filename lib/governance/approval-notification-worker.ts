import { createAdminClient } from '@/lib/supabase/admin'
import { createExternalApprovalToken } from './external-approval-token'

type ApprovalChannel = 'DATANEXUS' | 'EMAIL' | 'TEAMS'

type OutboxRow = {
  id: string
  approval_request_id: string
  recipient_user_id: string
  channel: ApprovalChannel
  event_type: string
  payload: Record<string, unknown> | null
  attempt_count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function providerUrl(channel: ApprovalChannel): string | null {
  if (channel === 'EMAIL') return process.env.DATANEXUS_APPROVAL_EMAIL_WEBHOOK_URL?.trim() || null
  if (channel === 'TEAMS') return process.env.DATANEXUS_APPROVAL_TEAMS_WEBHOOK_URL?.trim() || null
  return null
}

async function recipientEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) throw new Error(`Unable to resolve approval notification recipient: ${error.message}`)
  return data.user?.email ?? null
}

async function mark(id: string, values: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.schema('governance').from('agent_approval_notification_outbox')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Unable to update approval notification outbox: ${error.message}`)
}

function appBaseUrl() {
  const explicit = process.env.DATANEXUS_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) return `https://${production.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  throw new Error('DATANEXUS_APP_URL or VERCEL_PROJECT_PRODUCTION_URL is required for external approval links.')
}

function externalApprovalTokenExpiry(payload: Record<string, unknown>) {
  const now = Date.now()
  const dueAt = new Date(String(payload.slaDueAt ?? '')).getTime()
  if (Number.isFinite(dueAt)) return Math.max(now + DAY_MS, dueAt + DAY_MS)
  return now + 8 * DAY_MS
}

async function deliver(row: OutboxRow) {
  if (row.channel === 'DATANEXUS') {
    await mark(row.id, { status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
    return { id: row.id, channel: row.channel, status: 'SENT' }
  }

  const url = providerUrl(row.channel)
  if (!url) {
    await mark(row.id, {
      status: 'FAILED',
      attempt_count: row.attempt_count + 1,
      next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      last_error: `${row.channel} approval notification provider is not configured.`,
    })
    return { id: row.id, channel: row.channel, status: 'FAILED', error: 'PROVIDER_NOT_CONFIGURED' }
  }

  const email = await recipientEmail(row.recipient_user_id)
  if (!email) {
    await mark(row.id, {
      status: 'FAILED',
      attempt_count: row.attempt_count + 1,
      next_attempt_at: new Date(Date.now() + DAY_MS).toISOString(),
      last_error: 'Recipient has no email address.',
    })
    return { id: row.id, channel: row.channel, status: 'FAILED', error: 'RECIPIENT_EMAIL_MISSING' }
  }

  const payload = row.payload ?? {}
  const axis = String(payload.approvalAxis ?? '')
  if (!['BUSINESS','GOVERNANCE'].includes(axis)) {
    throw new Error('Approval notification is missing a valid approval axis.')
  }
  const token = createExternalApprovalToken({
    requestId: row.approval_request_id,
    recipientUserId: row.recipient_user_id,
    axis: axis as 'BUSINESS' | 'GOVERNANCE',
    channel: row.channel,
    expiresAt: externalApprovalTokenExpiry(payload),
  })
  const approvalUrl = `${appBaseUrl()}/approvals/external/${encodeURIComponent(token)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: row.channel,
      recipient: { userId: row.recipient_user_id, email },
      approvalRequestId: row.approval_request_id,
      approvalAxis: axis,
      eventType: row.event_type,
      approvalUrl,
      payload,
    }),
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 1000)
    await mark(row.id, {
      status: 'FAILED',
      attempt_count: row.attempt_count + 1,
      next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      last_error: `${row.channel} provider returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    })
    return { id: row.id, channel: row.channel, status: 'FAILED', error: `HTTP_${response.status}` }
  }

  await mark(row.id, {
    status: 'SENT',
    attempt_count: row.attempt_count + 1,
    sent_at: new Date().toISOString(),
    last_error: null,
  })
  return { id: row.id, channel: row.channel, status: 'SENT' }
}

export async function processApprovalNotificationOutbox(limit = 25) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('agent_approval_notification_outbox')
    .select('id,approval_request_id,recipient_user_id,channel,event_type,payload,attempt_count')
    .in('status', ['PENDING','FAILED'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at')
    .limit(limit)
  if (error) throw new Error(`Unable to claim approval notifications: ${error.message}`)

  const results = []
  for (const row of (data ?? []) as OutboxRow[]) {
    try {
      results.push(await deliver(row))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Approval notification delivery failed.'
      await mark(row.id, {
        status: 'FAILED',
        attempt_count: row.attempt_count + 1,
        next_attempt_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        last_error: message.slice(0, 2000),
      }).catch(() => undefined)
      results.push({ id: row.id, channel: row.channel, status: 'FAILED', error: message })
    }
  }
  return { processed: results.length, results }
}
