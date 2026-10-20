import { NextResponse } from 'next/server'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { recordLearningExperimentAttemptScore } from '@/lib/agents/governed-learning-evaluation-service'

export const runtime = 'nodejs'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const criterionScores = Array.isArray(body?.criterionScores) ? body.criterionScores : null
    if (!criterionScores || criterionScores.length === 0 || criterionScores.length > 50) {
      return NextResponse.json({ error: 'criterionScores must contain between one and fifty rubric scores.' }, { status: 400 })
    }
    const scoreId = await recordLearningExperimentAttemptScore({
      policyRecordId: text(body?.policyRecordId),
      claimId: text(body?.claimId),
      outputHash: text(body?.outputHash),
      rubricDigest: text(body?.rubricDigest),
      calibrationDigest: text(body?.calibrationDigest),
      criterionScores: criterionScores as Array<{ key: string; score: number }>,
      overallScore: typeof body?.overallScore === 'number' ? body.overallScore : Number.NaN,
    })
    return NextResponse.json({ scoreId }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record evaluator score.' }, { status: 400 })
  }
}
