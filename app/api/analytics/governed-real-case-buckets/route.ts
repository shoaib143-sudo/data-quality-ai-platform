import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { runGovernedRealCaseBucketSeries } from '@/lib/data-quality/governed-real-case-bucket-service'
import type { RealCaseBucketGranularity } from '@/lib/data-quality/governed-real-case-buckets'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function granularity(value: unknown): RealCaseBucketGranularity | null {
  return value === 'DAY' || value === 'WEEK' || value === 'MONTH' ? value : null
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const windowStart = text(body.windowStart)
    const windowEnd = text(body.windowEnd)
    const evidenceCutoffAt = text(body.evidenceCutoffAt)
    const bucketGranularity = granularity(body.granularity)

    if (!projectId || !windowStart || !windowEnd || !evidenceCutoffAt || !bucketGranularity) {
      return NextResponse.json({
        error: 'projectId, windowStart, windowEnd, evidenceCutoffAt, and granularity (DAY, WEEK, or MONTH) are required.',
      }, { status: 400 })
    }

    const minimumSampleSize = body.minimumSampleSize == null ? undefined : Number(body.minimumSampleSize)
    if (minimumSampleSize != null && (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 1 || minimumSampleSize > 1000)) {
      return NextResponse.json({ error: 'minimumSampleSize must be an integer between 1 and 1000.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')

    const result = await runGovernedRealCaseBucketSeries({
      projectId,
      windowStart,
      windowEnd,
      evidenceCutoffAt,
      granularity: bucketGranularity,
      minimumSampleSize,
      persist: false,
    })

    return NextResponse.json({
      projectId,
      series: result,
      learningPolicy: {
        historical_observation_only: true,
        interpolation_permitted: false,
        predictive_probability_exposed: false,
        causal_effect_claimed: false,
        current_authorization_required: true,
        read_request_persists_learning_state: false,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Governed bucket series failed.'
    const isInputError = message.includes('timestamp') || message.includes('window') || message.includes('bucket')
    return NextResponse.json({ error: message }, { status: isInputError ? 400 : 500 })
  }
}
