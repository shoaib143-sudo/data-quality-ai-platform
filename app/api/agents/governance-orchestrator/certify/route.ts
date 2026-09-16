import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertIndependentCertificationProducer } from '@/lib/orchestration/certification-independence'
import { finalizeGovernanceOrchestratorCertification } from '@/lib/orchestration/governance-orchestrator-service-v2'
import { assembleAndPersistGovernanceOutcomeReport } from '@/lib/orchestration/governance-outcome-report-service'

export const maxDuration = 300

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const orchestratorRunId = text(body?.orchestratorRunId ?? body?.orchestrator_run_id)
    if (!projectId || !orchestratorRunId) return NextResponse.json({ error: 'projectId and orchestratorRunId are required.' }, { status: 400 })

    // Certification authority is intentionally distinct from agent execution authority.
    await authorizeProject(user.id, projectId, 'certification.review')

    // Enforce producer independence at the authenticated API boundary. Capability separation alone
    // is insufficient because one user may legitimately hold both execute and review capabilities.
    const admin = createAdminClient()
    const { data: run, error: runError } = await admin.schema('governance').from('governance_orchestrator_runs')
      .select('actor_user_id').eq('id', orchestratorRunId).eq('project_id', projectId).maybeSingle()
    if (runError) throw new Error(`Unable to resolve certification producer identity: ${runError.message}`)
    if (!run) return NextResponse.json({ error: 'Governance orchestrator run was not found.' }, { status: 404 })
    assertIndependentCertificationProducer({
      executionActorUserId: run.actor_user_id ? String(run.actor_user_id) : null,
      certifierUserId: user.id,
    })

    const result = await finalizeGovernanceOrchestratorCertification({ projectId, orchestratorRunId })
    const refreshedReport = await assembleAndPersistGovernanceOutcomeReport({ projectId, orchestratorRunId })
    return NextResponse.json({ certified: result.assessmentState === 'PASS', refreshedReport, ...result }, { status: result.assessmentState === 'PASS' ? 200 : 409 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Independent orchestrator certification failed.'
    const status = message.startsWith('Canonical capability evidence is not certification-ready')
      || message.startsWith('Independent certification requires')
      || message.startsWith('Certification cannot proceed')
      ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}