import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { loadRecommendationEffectiveness } from '@/lib/profiling/recommendation-learning'

function text(value: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const { searchParams } = new URL(request.url)
    const projectId = text(searchParams.get('projectId'))
    const actions = searchParams.getAll('action').map((action) => action.trim()).filter(Boolean)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'quality.read')
    const effectiveness = await loadRecommendationEffectiveness(projectId, actions)

    const totals = effectiveness.reduce((summary, row) => {
      summary.attempts += row.attempts
      summary.effective += row.effective
      summary.ineffective += row.ineffective
      return summary
    }, { attempts: 0, effective: 0, ineffective: 0 })

    return NextResponse.json({
      projectId,
      totals: {
        ...totals,
        success_rate: totals.attempts ? Math.round((totals.effective / totals.attempts) * 10000) / 10000 : null,
      },
      effectiveness,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load profiling recommendation effectiveness.',
    }, { status: 500 })
  }
}
