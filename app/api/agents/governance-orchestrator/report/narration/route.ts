import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { getLatestGovernanceOutcomeReport } from '@/lib/orchestration/governance-outcome-report-service'
import { buildExecutiveNarrationScript } from '@/lib/orchestration/governance-report-narration'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const orchestratorRunId = url.searchParams.get('orchestratorRunId')?.trim() || null
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')

    const stored = await getLatestGovernanceOutcomeReport({ projectId, orchestratorRunId })
    if (!stored) return NextResponse.json({ error: 'No governed outcome report is available for narration.' }, { status: 404 })

    const script = buildExecutiveNarrationScript(stored.report)
    return new Response(script, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="datanexus-executive-briefing-${stored.orchestratorRunId}.txt"`,
        'Cache-Control': 'private, no-store',
        'X-DataNexus-Report-Hash': stored.reportHash,
        'X-DataNexus-Narration-Provider': 'NONE_SCRIPT_ONLY',
      },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to produce executive narration script.' }, { status: 500 })
  }
}
