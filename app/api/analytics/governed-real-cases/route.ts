import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { runGovernedRealCaseAnalysis } from '@/lib/data-quality/governed-real-case-analysis-service'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return fallback
  return Math.min(value, 1000)
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const windowStart = text(body.from)
    const windowEnd = text(body.to)
    const evidenceCutoffAt = text(body.asOf)

    if (!projectId || !windowStart || !windowEnd || !evidenceCutoffAt) {
      return NextResponse.json({ error: 'projectId, from, to, and asOf are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')

    const result = await runGovernedRealCaseAnalysis({
      projectId,
      windowStart,
      windowEnd,
      evidenceCutoffAt,
      minimumSampleSize: positiveInteger(body.minimumSampleSize, 5),
      persist: false,
    })

    const exclusionReasons = result.assessments.reduce<Record<string, number>>((counts, assessment) => {
      if (!assessment.learningExclusionReason) return counts
      counts[assessment.learningExclusionReason] = (counts[assessment.learningExclusionReason] ?? 0) + 1
      return counts
    }, {})

    return NextResponse.json({
      projectId,
      status: result.analysis.status,
      sampleSize: result.analysis.sampleSize,
      requiredSampleSize: result.analysis.status === 'INSUFFICIENT_EVIDENCE' ? result.analysis.requiredSampleSize : undefined,
      outcomeCounts: result.analysis.status === 'OK' ? result.analysis.outcomeCounts : undefined,
      assessedCaseCount: result.assessments.length,
      eligibleCaseCount: result.assessments.filter((assessment) => assessment.learningEligible).length,
      exclusionReasons,
      evidence: result.envelope,
      policy: {
        historical_context_never_authorizes_action: true,
        current_authorization_required: true,
        predictive_probability_exposed: false,
        read_request_persists_learning_state: false,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error && /timestamp|windowStart|windowEnd|evidenceCutoffAt/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed real-case analysis failed.' }, { status: 500 })
  }
}
