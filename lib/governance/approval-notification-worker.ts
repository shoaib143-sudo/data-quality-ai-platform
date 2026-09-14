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
const BASE_RETRY_MS = 15 * 60 * 1000
const MAX_RETRY_MS = DAY_MS

function maximumAttempts() {
  const configured = Number.parseInt(process.env.DATANEXUS_APPROVAL_NOTIFICATION_MAX_ATTEMPTS ?? '', 10)
  if (!Number.isFinite(configured)) return 5
  return Math.min(20, Math.max(1, configured))
}

function retryDelayMs(attemptCount: number) {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** Math.min(Math.max(0, attemptCount), 8)))
}

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

async function markFailure(row: OutboxRow, error: string) {
  const attempts = row.attempt_count + 1
  const deadLettered = attempts >= maximumAttempts()
  const now = new Date()
  await mark(row.id, {
    status: deadLettered ? 'DEAD_LETTER' : 'FAILED',
    attempt_count: attempts,
    last_attempt_at: now.toISOString(),
    next_attempt_at: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
    dead_lettered_at: deadLettered ? now.toISOString() : null,
    last_error: error.slice(0, 2000),
  })
  return deadLettered ? 'DEAD_LETTER' : 'FAILED'
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
  const now = new Date().toISOString()
  if (row.channel === 'DATANEXUS') {
    await mark(row.id, {
      status: 'SENT',
      attempt_count: row.attempt_count + 1,
      last_attempt_at: now,
      sent_at: now,
      dead_lettered_at: null,
      last_error: null,
    })
    return { id: row.id, channel: row.channel, status: 'SENT' }
  }

  const url = providerUrl(row.channel)
  if (!url) {
    const status = await markFailure(row, `${row.channel} approval notification provider is not configured.`)
    return { id: row.id, channel: row.channel, status, error: 'PROVIDER_NOT_CONFIGURED' }
  }

  const email = await recipientEmail(row.recipient_user_id)
  if (!email) {
    const status = await markFailure(row, 'Recipient has no email address.')
    return { id: row.id, channel: row.channel, status, error: 'RECIPIENT_EMAIL_MISSING' }
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
  const baseUrl = appBaseUrl()
  const approvalUrl = `${baseUrl}/approvals/external/${encodeURIComponent(token)}`
  const approvalsPath = String(payload.approvalsUrl ?? `/approvals?request=${encodeURIComponent(row.approval_request_id)}`)
  const openInDataNexusUrl = `${baseUrl}${approvalsPath.startsWith('/') ? approvalsPath : `/${approvalsPath}`}`

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
      openInDataNexusUrl,
      payload,
    }),
  })

  if (!response.ok) {
    const status = await markFailure(row, `${row.channel} provider returned HTTP ${response.status}.`)
    return { id: row.id, channel: row.channel, status, error: `HTTP_${response.status}` }
  }

  const sentAt = new Date().toISOString()
  await mark(row.id, {
    status: 'SENT',
    attempt_count: row.attempt_count + 1,
    last_attempt_at: sentAt,
    sent_at: sentAt,
    dead_lettered_at: null,
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
      const status = await markFailure(row, message).catch(() => 'FAILED')
      results.push({ id: row.id, channel: row.channel, status, error: message })
    }
  }
  return { processed: results.length, results }
}
