import { createAdminClient } from '@/lib/supabase/admin'

export const AGENT_RUN_RESULT_ARTIFACT_TYPE = 'AGENT_RUN_RESULT'
export const AGENT_RUN_RESULT_ARTIFACT_VERSION = '1.0'

export type AgentRunResultArtifact = {
  artifactId: string
  contentHash: string
  createdAt: string
}

export async function persistAgentRunResultArtifact(input: {
  agentRunId: string
  output: Record<string, unknown>
  name?: string
  completedAt?: string | null
}): Promise<AgentRunResultArtifact> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('persist_agent_run_result', {
    p_agent_run_id: input.agentRunId,
    p_output: input.output,
    p_artifact_type: AGENT_RUN_RESULT_ARTIFACT_TYPE,
    p_artifact_version: AGENT_RUN_RESULT_ARTIFACT_VERSION,
    p_name: input.name?.trim() || 'Agent run result',
    p_completed_at: input.completedAt ?? new Date().toISOString(),
  })

  if (error) throw new Error(`Unable to persist durable agent result artifact: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.artifact_id || !row?.content_hash || !row?.created_at) {
    throw new Error('Durable agent result artifact persistence returned incomplete evidence.')
  }

  return {
    artifactId: String(row.artifact_id),
    contentHash: String(row.content_hash),
    createdAt: String(row.created_at),
  }
}
