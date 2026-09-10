import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { loadDatasetGovernancePosture } from '@/lib/governance/dataset-governance-posture'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const datasetId = url.searchParams.get('datasetId')?.trim() ?? ''

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const posture = await loadDatasetGovernancePosture(projectId, datasetId)

    return NextResponse.json({
      capability: 'catalog.read',
      projectId,
      datasetId,
      posture,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to load dataset governance posture.'
    const status = message.includes('not found in the authorized project') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
