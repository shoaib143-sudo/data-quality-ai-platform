import { NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const sourceId = text(body.sourceId)
    if (!projectId || !sourceId) return NextResponse.json({ error: 'projectId and sourceId are required.', code: 'INVALID_VALIDATION_REQUEST' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const result = await revalidateAndReconcileSourceForProfiling({ projectId, sourceId })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message, code: 'PROJECT_ACCESS_DENIED' }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Source validation failed.'
    const status = message === 'Data source not found.' ? 404 : 500
    return NextResponse.json({ error: message, code: status === 404 ? 'SOURCE_NOT_FOUND' : 'SOURCE_VALIDATION_REQUEST_FAILED' }, { status })
  }
}
