import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { buildGovernanceIntelligenceBrief } from '@/lib/governance/governance-intelligence-brief'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')
    const brief = await buildGovernanceIntelligenceBrief(projectId)

    return NextResponse.json({
      projectId,
      capability: 'catalog.read',
      brief,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build Governance Intelligence brief.' }, { status: 500 })
  }
}
