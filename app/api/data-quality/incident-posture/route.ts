import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { loadDataQualityIncidentPosture } from '@/lib/data-quality/incident-posture'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const qualityRuleRunId = url.searchParams.get('qualityRuleRunId')?.trim() ?? ''

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!qualityRuleRunId) return NextResponse.json({ error: 'qualityRuleRunId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const posture = await loadDataQualityIncidentPosture(projectId, qualityRuleRunId)
    return NextResponse.json({ capability: 'catalog.read', projectId, qualityRuleRunId, posture })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to load data quality incident posture.'
    const status = message.includes('not found in the authorized project') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
