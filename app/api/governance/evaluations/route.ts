import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createGovernanceEvaluationEngine } from '@/lib/ai/governance-evaluation-engine'

function optionalQuery(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim()
  return value ? value : null
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const searchParams = new URL(request.url).searchParams
    const projectId = searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')

    const engine = createGovernanceEvaluationEngine()
    const scorecard = await engine.scorecard({
      projectId,
      aiSystemVersionId: optionalQuery(searchParams, 'aiSystemVersionId'),
      evaluationType: optionalQuery(searchParams, 'evaluationType'),
      capability: optionalQuery(searchParams, 'capability'),
    })

    return NextResponse.json({
      projectId,
      capability: 'catalog.read',
      scorecard,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: 'Unable to read AI evaluation scorecard.' }, { status: 500 })
  }
}
