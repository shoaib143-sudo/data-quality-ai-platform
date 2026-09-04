import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  listProjectionConsumerHealth,
  reconcileProjectionConsumer,
  resetProjectionConsumer,
  resumeProjectionConsumer,
} from '@/lib/data-plane/projection-operations'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim()
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'retention.manage')
    const consumers = await listProjectionConsumerHealth(projectId)
    return NextResponse.json({ projectId, consumers })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to inspect projection consumers' }, { status: 500 })
  }
}

type ProjectionOperationBody = {
  projectId?: string
  consumerKey?: string
  action?: 'RECONCILE' | 'RESET' | 'RESUME'
  reason?: string
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as ProjectionOperationBody | null
    const projectId = body?.projectId?.trim()
    const consumerKey = body?.consumerKey?.trim()
    const action = body?.action
    if (!projectId || !consumerKey || !action) {
      return NextResponse.json({ error: 'projectId, consumerKey and action are required' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'retention.manage')

    if (action === 'RECONCILE') {
      const result = await reconcileProjectionConsumer({ projectId, consumerKey, actorUserId: user.id })
      return NextResponse.json(result)
    }
    if (action === 'RESET') {
      const result = await resetProjectionConsumer({
        projectId,
        consumerKey,
        reason: body?.reason ?? '',
        actorUserId: user.id,
      })
      return NextResponse.json(result)
    }
    if (action === 'RESUME') {
      const result = await resumeProjectionConsumer({ projectId, consumerKey, actorUserId: user.id })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unsupported projection action' }, { status: 400 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Projection operation failed' }, { status: 500 })
  }
}
