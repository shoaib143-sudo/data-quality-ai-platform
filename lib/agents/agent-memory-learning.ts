import { createAdminClient } from '@/lib/supabase/admin'
import { persistAgentWorkingMemory } from '@/lib/agents/agent-memory'
import { retrieveGovernedLearningContext } from '@/lib/agents/governed-learning-context'

export async function enrichGovernedAgentWithMemory(input: {
  projectId: string
  agentDefinitionId: string
  agentRunId: string
  question?: string | null
  output: Record<string, unknown>
}) {
  const observations = Array.isArray(input.output.observations)
    ? input.output.observations.filter((item): item is string => typeof item === 'string')
    : []
  const query = input.question?.trim() || observations.slice(0, 3).join(' ') || 'governance quality risk remediation'
  const prior = await retrieveGovernedLearningContext({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    query,
    limit: 10,
  })

  const existingRecommendations = Array.isArray(input.output.recommendations) ? input.output.recommendations : []
  const verifiedEpisodes = prior.verifiedEpisodes.map((episode) => ({
    id: episode.id,
    source_kind: episode.content.sourceKind ?? null,
    problem_type: episode.content.problemType ?? null,
    effectiveness: episode.content.effectiveness ?? null,
    confidence: episode.content.confidence ?? null,
    relevance: episode.relevance,
    occurred_at: episode.occurredAt,
    evidence_source: episode.evidence.source,
    evidence_record_id: episode.evidence.recordId,
    evidence_verified: episode.evidence.verified,
  }))

  const enriched = {
    ...input.output,
    recommendations: existingRecommendations,
    memoryContext: {
      query,
      durableMemoryMatches: prior.memories.length,
      verifiedEpisodeMatches: verifiedEpisodes.length,
      verifiedEpisodes,
      influenceEvidence: verifiedEpisodes.map((episode) => ({
        learning_case_id: episode.id,
        source_kind: episode.source_kind,
        evidence_source: episode.evidence_source,
        evidence_record_id: episode.evidence_record_id,
        verified: episode.evidence_verified,
        relevance: episode.relevance,
      })),
      durableMemories: prior.memories.slice(0, 5).map((memory) => ({
        id: memory.id,
        memory_key: memory.memory_key,
        memory_type: memory.memory_type,
        confidence: memory.confidence,
        relevance: memory.relevance,
        source_agent_run_id: memory.source_agent_run_id,
      })),
    },
    learningPolicy: {
      use_verified_prior_episodes_as_context: true,
      reuse_prior_recommendation_prose: false,
      semantic_memory_requires_separate_authority_gate: true,
      human_validated_semantic_memory_required_for_high_risk_action: true,
      memory_never_authorizes_actions: true,
      current_authorization_required_for_every_action: true,
      current_policy_decision_required_for_every_action: true,
      note: 'Verified prior episodes are provenance-bearing context only. Memory cannot authorize, approve, execute, or promote a new governance action; current deterministic authorization and policy controls remain independent.',
    },
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin.schema('agent').from('agent_runs').update({ output: enriched }).eq('id', input.agentRunId).eq('project_id', input.projectId)
  if (updateError) throw new Error(`Unable to persist memory-informed agent output: ${updateError.message}`)

  await persistAgentWorkingMemory({
    projectId: input.projectId,
    agentRunId: input.agentRunId,
    memoryKey: 'interaction_context',
    ttlMinutes: 120,
    content: {
      query,
      observations: observations.slice(0, 10),
      retrieved_memory_ids: prior.memories.map((memory) => memory.id),
      verified_episode_ids: prior.verifiedEpisodes.map((episode) => episode.id),
      verified_episode_influence_evidence: verifiedEpisodes.map((episode) => ({
        learning_case_id: episode.id,
        evidence_source: episode.evidence_source,
        evidence_record_id: episode.evidence_record_id,
      })),
    },
  })

  return enriched
}
