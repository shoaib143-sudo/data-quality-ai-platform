import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOVERNED_AGENT_KEYS,
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from '@/lib/agents/governed-agent-registry'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'agent.execute')
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,name,description,version,configuration')
      .in('agent_key', [...GOVERNED_AGENT_KEYS])
      .eq('enabled', true)
      .order('agent_key')
    if (error) throw new Error(`Unable to load governed agent registry: ${error.message}`)

    const enabled = new Map<string, Record<string, unknown>>()
    for (const row of data ?? []) {
      if (!enabled.has(String(row.agent_key))) enabled.set(String(row.agent_key), row as Record<string, unknown>)
    }

    const missingAgentKeys = GOVERNED_AGENT_KEYS.filter((key) => !enabled.has(key))
    const agents = GOVERNED_AGENT_KEYS.map((key: GovernedAgentKey) => ({
      definition: enabled.get(key) ?? null,
      policy: getGovernedAgentPolicy(key),
    }))

    return NextResponse.json({
      projectId,
      capability: 'agent.execute',
      registryVersion: '1.0',
      readiness: missingAgentKeys.length ? 'INCOMPLETE' : 'READY',
      requiredAgentCount: GOVERNED_AGENT_KEYS.length,
      enabledRequiredAgentCount: GOVERNED_AGENT_KEYS.length - missingAgentKeys.length,
      missingAgentKeys,
      agents,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load governed agent registry.' }, { status: 500 })
  }
}
