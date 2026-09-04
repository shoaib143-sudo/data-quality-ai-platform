import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function persistGovernedAgentMemoryAndEvaluation(input: {
  projectId: string
  agentDefinitionId: string
  agentRunId: string
  agentKey: string
  output: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const memoryKey = `project_summary:${input.agentKey}`
  const content = {
    agent: input.output.agent ?? null,
    generatedAt: input.output.generatedAt ?? new Date().toISOString(),
    counts: input.output.counts ?? {},
    health: input.output.health ?? {},
    observations: input.output.observations ?? [],
    limitations: input.output.limitations ?? [],
  }
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString()
  const contentHash = digest(content)

  const { data: existing, error: existingError } = await admin
    .schema('agent')
    .from('agent_memories')
    .select('id')
    .eq('project_id', input.projectId)
    .eq('agent_definition_id', input.agentDefinitionId)
    .eq('memory_key', memoryKey)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve active agent memory: ${existingError.message}`)

  if (existing) {
    const { error } = await admin.schema('agent').from('agent_memories').update({
      source_agent_run_id: input.agentRunId,
      memory_type: 'SUMMARY',
      content,
      confidence: 1,
      content_hash: contentHash,
      promoted_at: now.toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }).eq('id', existing.id)
    if (error) throw new Error(`Unable to refresh agent memory: ${error.message}`)
  } else {
    const { error } = await admin.schema('agent').from('agent_memories').insert({
      project_id: input.projectId,
      agent_definition_id: input.agentDefinitionId,
      source_agent_run_id: input.agentRunId,
      memory_key: memoryKey,
      memory_type: 'SUMMARY',
      content,
      confidence: 1,
      content_hash: contentHash,
      status: 'ACTIVE',
      promoted_at: now.toISOString(),
      expires_at: expiresAt,
    })
    if (error) throw new Error(`Unable to promote agent memory: ${error.message}`)
  }

  const { error: evaluationError } = await admin.schema('agent').from('agent_evaluations').upsert({
    project_id: input.projectId,
    agent_run_id: input.agentRunId,
    evaluator_type: 'SYSTEM_CONTRACT',
    evaluator_version: '1.0',
    score: 1,
    dimensions: {
      execution_succeeded: 1,
      read_only_boundary: 1,
      project_scope_enforced: 1,
      bounded_evidence: 1,
    },
    feedback: {
      evaluation_kind: 'operational_contract',
      note: 'This score measures execution-contract compliance, not semantic answer quality.',
    },
  }, { onConflict: 'agent_run_id,evaluator_type,evaluator_version' })
  if (evaluationError) throw new Error(`Unable to persist agent evaluation: ${evaluationError.message}`)

  return { memoryKey, contentHash, expiresAt }
}
