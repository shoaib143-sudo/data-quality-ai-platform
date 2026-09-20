import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { getHistoricalExportStatus } from '@/lib/orchestration/historical-export'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { exportId } = await params
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const includeSignedUrls = url.searchParams.get('signedUrls') === 'true'

    if (!projectId || !exportId?.trim()) {
      return NextResponse.json({ error: 'projectId and exportId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'report.export')
    const exportJob = await getHistoricalExportStatus({
      projectId,
      exportId: exportId.trim(),
      signedUrls: includeSignedUrls,
    })
    if (!exportJob) return NextResponse.json({ error: 'Historical export not found.' }, { status: 404 })

    return NextResponse.json(exportJob, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load historical export.',
    }, { status: 500 })
  }
}
