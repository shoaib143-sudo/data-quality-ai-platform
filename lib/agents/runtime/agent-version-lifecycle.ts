import { createAdminClient } from '@/lib/supabase/admin'

export const AGENT_VERSION_STATES = ['DRAFT','VALIDATED','CANDIDATE','ACTIVE','DEPRECATED','RETIRED'] as const
export type AgentVersionState = typeof AGENT_VERSION_STATES[number]

export async function getAgentVersionLifecycle(agentDefinitionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('agent_version_lifecycle')
    .select('agent_definition_id,agent_key,version,lifecycle_state,reason,updated_by,updated_at,created_at')
    .eq('agent_definition_id', agentDefinitionId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load agent version lifecycle: ${error.message}`)
  if (!data) throw new Error('Agent version lifecycle was not found.')
  return data
}

export async function assertActiveAgentVersion(agentDefinitionId: string) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').rpc('assert_active_agent_version', {
    p_agent_definition_id: agentDefinitionId,
  })
  if (error) throw new Error(`Agent version is not executable: ${error.message}`)
}

export async function transitionAgentVersionLifecycle(input: {
  agentDefinitionId: string
  targetState: AgentVersionState
  actorUserId: string
  reason: string
}) {
  const reason = input.reason.trim()
  if (!reason) throw new Error('Agent version lifecycle transition reason is required.')
  if (!AGENT_VERSION_STATES.includes(input.targetState)) throw new Error('Unsupported agent version lifecycle state.')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('transition_agent_version_lifecycle', {
    p_agent_definition_id: input.agentDefinitionId,
    p_target_state: input.targetState,
    p_actor_user_id: input.actorUserId,
    p_reason: reason,
  })
  if (error) throw new Error(`Unable to transition agent version lifecycle: ${error.message}`)
  if (!data) throw new Error('Agent version lifecycle transition returned no state.')
  return data
}
