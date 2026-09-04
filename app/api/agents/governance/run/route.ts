import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeGovernanceReadAgent, GOVERNANCE_READ_AGENT_KEYS } from '@/lib/agents/governance-read-agent'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim()
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.execute')

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,name,description,version,configuration')
      .in('agent_key', [...GOVERNANCE_READ_AGENT_KEYS])
      .eq('enabled', true)
      .order('name')
    if (error) throw new Error(`Unable to list governed agents: ${error.message}`)

    return NextResponse.json({ projectId, agents: data ?? [] })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list governed agents.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const agentDefinitionId = text(body?.agentDefinitionId ?? body?.agent_definition_id)
    const question = text(body?.question)
    if (!projectId || !agentDefinitionId) {
      return NextResponse.json({ error: 'projectId and agentDefinitionId are required.' }, { status: 400 })
    }
    if (question.length > 1000) return NextResponse.json({ error: 'question must be 1000 characters or fewer.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'agent.execute')
    const result = await executeGovernanceReadAgent({
      projectId,
      agentDefinitionId,
      actorUserId: user.id,
      question: question || null,
    })
    return NextResponse.json({ accepted: true, ...result }, { status: 200 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed agent execution failed.' }, { status: 500 })
  }
}
