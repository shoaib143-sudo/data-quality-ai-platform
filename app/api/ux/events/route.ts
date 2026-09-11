import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const EVENT_TYPES = new Set(['UX_JOURNEY_VIEWED', 'UX_JOURNEY_NEXT_ACTION_SELECTED'])
const STAGES = new Set(['CONNECT', 'DISCOVER', 'PROFILE', 'REMEDIATE', 'VERIFY', 'COMPLETE'])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function integer(value: unknown, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'JSON request body is required.' }, { status: 400 })

    const projectId = text(body.projectId)
    const eventType = text(body.eventType).toUpperCase()
    const stage = text(body.stage).toUpperCase()
    const completedStages = integer(body.completedStages, 0, 5)

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: 'Unsupported UX telemetry event.' }, { status: 400 })
    if (!STAGES.has(stage)) return NextResponse.json({ error: 'Invalid journey stage.' }, { status: 400 })
    if (completedStages === null) return NextResponse.json({ error: 'completedStages must be an integer from 0 to 5.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')

    const occurredAt = new Date().toISOString()
    const admin = createAdminClient()
    const { error } = await admin.schema('orchestration').from('analytics_events').insert({
      event_id: crypto.randomUUID(),
      project_id: projectId,
      schema_version: 1,
      event_type: eventType,
      occurred_at: occurredAt,
      aggregate_type: 'ux_governance_journey',
      aggregate_id: projectId,
      aggregate_version: '1',
      actor_type: 'USER',
      actor_id: user.id,
      payload: {
        stage,
        completedStages,
        totalStages: 5,
      },
    })
    if (error) throw new Error(`UX telemetry persistence failed: ${error.message}`)

    return NextResponse.json({ accepted: true, eventType, occurredAt }, { status: 202 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('UX telemetry event failed', error)
    return NextResponse.json({ error: 'Unable to record UX telemetry event.' }, { status: 500 })
  }
}
