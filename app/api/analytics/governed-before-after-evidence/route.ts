import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { runGovernedBeforeAfterEvidenceAnalysis } from '@/lib/data-quality/governed-before-after-evidence-service'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function minimumSampleSize(value: unknown) {
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error('minimumCaseSampleSize must be an integer between 1 and 1000.')
  }
  return value
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const windowStart = text(body.windowStart)
    const windowEnd = text(body.windowEnd)
    const evidenceCutoffAt = text(body.evidenceCutoffAt)

    if (!projectId || !windowStart || !windowEnd || !evidenceCutoffAt) {
      return NextResponse.json({
        error: 'projectId, windowStart, windowEnd, and evidenceCutoffAt are required.',
      }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')

    const result = await runGovernedBeforeAfterEvidenceAnalysis({
      projectId,
      windowStart,
      windowEnd,
      evidenceCutoffAt,
      minimumCaseSampleSize: minimumSampleSize(body.minimumCaseSampleSize),
      persist: false,
    })

    return NextResponse.json({
      projectId,
      analysis: result,
      learningPolicy: {
        descriptive_observation_only: true,
        numeric_direction_is_not_improvement: true,
        effectiveness_claimed: false,
        predictive_probability_exposed: false,
        causal_effect_claimed: false,
        current_authorization_required: true,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Governed before/after evidence analysis failed.'
    const status = message.startsWith('minimumCaseSampleSize') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
