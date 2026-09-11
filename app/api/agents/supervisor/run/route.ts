import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { runNativeSpecialistSupervisor } from '@/lib/agents/runtime/native-supervisor-service'

export const maxDuration = 300

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const goal = text(body?.goal)
    const workers = Array.isArray(body?.workers) ? body?.workers : []

    if (!projectId || !goal) {
      return NextResponse.json({ error: 'projectId and goal are required.' }, { status: 400 })
    }
    if (goal.length > 2000) {
      return NextResponse.json({ error: 'goal must be 2000 characters or fewer.' }, { status: 400 })
    }
    if (workers.length < 1 || workers.length > 6) {
      return NextResponse.json({ error: 'workers must contain between 1 and 6 specialist requests.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.execute')

    const result = await runNativeSpecialistSupervisor({
      projectId,
      actorUserId: user.id,
      goal,
      workers: workers.map((worker) => {
        const value = worker && typeof worker === 'object' && !Array.isArray(worker)
          ? worker as Record<string, unknown>
          : {}
        return {
          agentDefinitionId: text(value.agentDefinitionId ?? value.agent_definition_id),
          question: text(value.question) || null,
        }
      }),
    })

    return NextResponse.json({
      accepted: true,
      supervisorRunId: result.supervisorRunId,
      planHash: result.planHash,
      childRunIds: result.childRunIds,
      status: result.status,
      completedStepIds: result.completedStepIds,
      failedStepId: result.failedStepId ?? null,
      code: result.code ?? null,
      monitorUrl: `/monitoring?run=${encodeURIComponent(result.supervisorRunId)}`,
    }, { status: result.status === 'SUCCEEDED' ? 200 : result.status === 'WAITING_APPROVAL' ? 202 : 409 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Native supervisor execution failed.',
    }, { status: 500 })
  }
}
