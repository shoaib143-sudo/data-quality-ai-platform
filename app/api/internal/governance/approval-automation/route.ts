import { NextResponse } from 'next/server'

import { evaluateAgentApprovalSlaEscalations } from '@/lib/governance/approval-sla'
import { processApprovalNotificationOutbox } from '@/lib/governance/approval-notification-worker'
import { requireInternalBearer } from '@/lib/security/internal-bearer'

async function run(request: Request) {
  if (!requireInternalBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const sla = await evaluateAgentApprovalSlaEscalations(100)
  const delivery = await processApprovalNotificationOutbox(25)

  return NextResponse.json({
    sla: { evaluated: sla.evaluated, emitted: sla.emitted },
    delivery: { processed: delivery.processed },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
