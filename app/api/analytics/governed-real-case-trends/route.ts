import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { runGovernedRealCaseTrendComparison } from '@/lib/data-quality/governed-real-case-trend-service'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const previousWindowStart = text(body.previousWindowStart)
    const previousWindowEnd = text(body.previousWindowEnd)
    const currentWindowStart = text(body.currentWindowStart)
    const currentWindowEnd = text(body.currentWindowEnd)
    const evidenceCutoffAt = text(body.evidenceCutoffAt)

    if (!projectId || !previousWindowStart || !previousWindowEnd || !currentWindowStart || !currentWindowEnd || !evidenceCutoffAt) {
      return NextResponse.json({
        error: 'projectId, previousWindowStart, previousWindowEnd, currentWindowStart, currentWindowEnd, and evidenceCutoffAt are required.',
      }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')

    const result = await runGovernedRealCaseTrendComparison({
      projectId,
      previousWindowStart,
      previousWindowEnd,
      currentWindowStart,
      currentWindowEnd,
      evidenceCutoffAt,
      minimumSampleSize: typeof body.minimumSampleSize === 'number' ? body.minimumSampleSize : undefined,
      persist: false,
    })

    return NextResponse.json({
      projectId,
      comparison: result,
      learningPolicy: {
        historical_observation_only: true,
        predictive_probability_exposed: false,
        causal_effect_claimed: false,
        current_authorization_required: true,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed trend comparison failed.' }, { status: 500 })
  }
}
