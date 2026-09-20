import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  createHistoricalExport,
  HISTORICAL_EXPORT_KINDS,
} from '@/lib/orchestration/historical-export'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const exportKind = typeof body.exportKind === 'string' ? body.exportKind.trim().toUpperCase() : ''

    if (!projectId || !exportKind) {
      return NextResponse.json({ error: 'projectId and exportKind are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'report.export')

    const exportJob = await createHistoricalExport({
      projectId,
      requestedBy: user.id,
      exportKind,
      filters: body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
        ? body.filters as Record<string, unknown>
        : {},
      chunkSize: typeof body.chunkSize === 'number' ? body.chunkSize : undefined,
      retentionDays: typeof body.retentionDays === 'number' ? body.retentionDays : undefined,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
    })

    return NextResponse.json({
      exportId: exportJob?.id,
      projectId,
      exportKind: exportJob?.export_kind,
      status: exportJob?.status,
      snapshotAt: exportJob?.snapshot_at,
      expiresAt: exportJob?.expires_at,
      supportedKinds: HISTORICAL_EXPORT_KINDS,
    }, { status: exportJob?.status === 'COMPLETED' ? 200 : 202 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to create historical export.'
    const status = /required|Unsupported historical export kind|valid timestamp|earlier than|unsupported characters|actorType|persona|depth/.test(message)
      ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
