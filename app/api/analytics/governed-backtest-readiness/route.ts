import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { runGovernedBacktestReadiness } from '@/lib/ai/governed-backtesting-service'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalInteger(value: unknown, label: string, maximum: number) {
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`)
  }
  return value
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const trainingCutoffAt = text(body.trainingCutoffAt)
    const evaluationEndAt = text(body.evaluationEndAt)

    if (!projectId || !trainingCutoffAt || !evaluationEndAt) {
      return NextResponse.json({
        error: 'projectId, trainingCutoffAt, and evaluationEndAt are required.',
      }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')

    const readiness = await runGovernedBacktestReadiness({
      projectId,
      trainingCutoffAt,
      evaluationEndAt,
      minimumTrainingCases: optionalInteger(body.minimumTrainingCases, 'minimumTrainingCases', 500),
      minimumEvaluationCases: optionalInteger(body.minimumEvaluationCases, 'minimumEvaluationCases', 500),
      datasetLimit: optionalInteger(body.datasetLimit, 'datasetLimit', 500),
    })

    return NextResponse.json({
      projectId,
      readiness,
      policy: {
        verified_production_cases_only: true,
        verified_negative_outcomes_preserved: true,
        synthetic_bootstrap_excluded: true,
        temporal_holdout_required: true,
        predictive_probability_exposed: false,
        shadow_decision_authority: false,
        current_authorization_required: true,
        read_only: true,
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Governed backtest readiness failed.'
    const status = /required|integer between|valid timestamp|before evaluationEndAt|projectId must match/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
