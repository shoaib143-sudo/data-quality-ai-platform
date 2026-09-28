import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  createOrUpdateMaturityAssessment,
  loadLatestMaturityAssessment,
  saveMaturityResponses,
} from '@/lib/governance/maturity-service'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function errorResponse(error: unknown, fallback: string) {
  const authorization = authorizationErrorResponse(error)
  if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 })
}

export async function GET() {
  try {
    const user = await requireApiUser()
    return NextResponse.json(await loadLatestMaturityAssessment(user.id))
  } catch (error) {
    return errorResponse(error, 'Unable to load governance maturity assessment.')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({}))
    const assessment = await createOrUpdateMaturityAssessment(user.id, { profile: body.profile, startNew: body.startNew === true })
    await writeGovernanceAudit({
      actorUserId: user.id,
      eventType: 'GOVERNANCE_MATURITY_ASSESSMENT_CONFIGURED',
      entityType: 'MATURITY_ASSESSMENT',
      entityId: assessment.id,
      metadata: { framework_version: assessment.framework_version, start_new_cycle: body.startNew === true },
    })
    return NextResponse.json(await loadLatestMaturityAssessment(user.id), { status: 201 })
  } catch (error) {
    return errorResponse(error, 'Unable to configure governance maturity assessment.')
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({}))
    const assessmentId = typeof body.assessmentId === 'string' ? body.assessmentId.trim() : ''
    if (!assessmentId) return NextResponse.json({ error: 'assessmentId is required.' }, { status: 400 })
    await saveMaturityResponses(user.id, assessmentId, body.responses)
    await writeGovernanceAudit({
      actorUserId: user.id,
      eventType: 'GOVERNANCE_MATURITY_RESPONSES_UPDATED',
      entityType: 'MATURITY_ASSESSMENT',
      entityId: assessmentId,
      metadata: { submitted_count: Array.isArray(body.responses) ? body.responses.length : 0 },
    })
    return NextResponse.json(await loadLatestMaturityAssessment(user.id))
  } catch (error) {
    return errorResponse(error, 'Unable to save governance maturity responses.')
  }
}
