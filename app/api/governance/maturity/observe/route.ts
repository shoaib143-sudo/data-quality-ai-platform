import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { collectGovernanceMaturityObservations } from '@/lib/governance/maturity-observation-service'
import { loadLatestMaturityAssessment, refreshMaturityAssessmentScorecard } from '@/lib/governance/maturity-service'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({}))
    const assessmentId = typeof body.assessmentId === 'string' ? body.assessmentId.trim() : ''
    if (!assessmentId) return NextResponse.json({ error: 'assessmentId is required.' }, { status: 400 })

    const result = await collectGovernanceMaturityObservations(user.id, assessmentId)
    await refreshMaturityAssessmentScorecard(assessmentId)
    await writeGovernanceAudit({
      actorUserId: user.id,
      eventType: 'GOVERNANCE_MATURITY_SYSTEM_OBSERVATION_COLLECTED',
      entityType: 'MATURITY_ASSESSMENT',
      entityId: assessmentId,
      metadata: { observations: result.observations.length, skipped: result.skipped },
    })
    return NextResponse.json({ result, assessment: await loadLatestMaturityAssessment(user.id) })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to collect maturity observations.' }, { status: 400 })
  }
}
