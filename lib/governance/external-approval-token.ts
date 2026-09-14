import { createHmac, timingSafeEqual } from 'node:crypto'

export type ExternalApprovalTokenPayload = {
  requestId: string
  recipientUserId: string
  axis: 'BUSINESS' | 'GOVERNANCE'
  channel: 'EMAIL' | 'TEAMS'
  expiresAt: number
}

function secret() {
  const value = process.env.DATANEXUS_APPROVAL_LINK_SECRET?.trim()
  if (!value) throw new Error('DATANEXUS_APPROVAL_LINK_SECRET is not configured.')
  return value
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

export function createExternalApprovalToken(payload: ExternalApprovalTokenPayload): string {
  const encoded = base64url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyExternalApprovalToken(token: string): ExternalApprovalTokenPayload {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) throw new Error('Invalid approval token.')
  const expected = createHmac('sha256', secret()).update(encoded).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid approval token signature.')

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<ExternalApprovalTokenPayload>
  if (!payload.requestId || !payload.recipientUserId || !['BUSINESS','GOVERNANCE'].includes(String(payload.axis))) {
    throw new Error('Invalid approval token payload.')
  }
  if (!['EMAIL','TEAMS'].includes(String(payload.channel))) throw new Error('Invalid approval token channel.')
  if (!Number.isFinite(payload.expiresAt) || Number(payload.expiresAt) <= Date.now()) {
    throw new Error('Approval token has expired.')
  }
  return payload as ExternalApprovalTokenPayload
}
