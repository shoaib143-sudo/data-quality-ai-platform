import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { addMaturityEvidence, loadLatestMaturityAssessment, refreshMaturityAssessmentScorecard } from '@/lib/governance/maturity-service'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({}))
    const evidence = await addMaturityEvidence(user.id, {
      assessmentId: typeof body.assessmentId === 'string' ? body.assessmentId : '',
      questionId: typeof body.questionId === 'string' ? body.questionId : '',
      evidenceType: typeof body.evidenceType === 'string' ? body.evidenceType : 'COMMENT',
      label: typeof body.label === 'string' ? body.label : '',
      referenceUri: typeof body.referenceUri === 'string' ? body.referenceUri : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
    })
    await refreshMaturityAssessmentScorecard(String(body.assessmentId))
    await writeGovernanceAudit({
      actorUserId: user.id,
      eventType: 'GOVERNANCE_MATURITY_EVIDENCE_ADDED',
      entityType: 'MATURITY_EVIDENCE',
      entityId: evidence.id,
      metadata: { assessment_id: body.assessmentId, question_id: body.questionId, evidence_type: body.evidenceType },
    })
    return NextResponse.json({ evidence, assessment: await loadLatestMaturityAssessment(user.id) }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add governance maturity evidence.' }, { status: 400 })
  }
}
