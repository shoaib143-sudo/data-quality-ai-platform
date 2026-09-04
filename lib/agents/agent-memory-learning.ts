import { createAdminClient } from '@/lib/supabase/admin'
import { persistAgentWorkingMemory, retrieveRelevantAgentMemory } from '@/lib/agents/agent-memory'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function recommendationAction(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return text(record.action) || text(record.reusable_guidance) || null
}

function dedupeRecommendations(values: unknown[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const action = value && typeof value === 'object' && !Array.isArray(value)
      ? text((value as Record<string, unknown>).action)
      : ''
    const key = action.toLowerCase()
    if (!key || seen.has(key)) return Boolean(!key)
    seen.add(key)
    return true
  })
}

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
  const prior = await retrieveRelevantAgentMemory({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    query,
    limit: 10,
  })

  const workedCases = prior.learningCases.filter((item: Record<string, unknown>) => {
    const effectiveness = number(item.effectiveness)
    return effectiveness !== null && effectiveness >= 0.5
  })
  const failedCases = prior.learningCases.filter((item: Record<string, unknown>) => {
    const effectiveness = number(item.effectiveness)
    return effectiveness !== null && effectiveness < 0.5
  })

  const learnedRecommendations = workedCases.flatMap((item: Record<string, unknown>) => {
    const action = recommendationAction(item.recommendation)
    if (!action) return []
    return [{
      priority: 'MEDIUM',
      action,
      source: 'PRIOR_LEARNING',
      learning_case_id: item.id,
      prior_outcome: item.outcome_status ?? null,
      prior_effectiveness: item.effectiveness ?? null,
      confidence: item.confidence ?? null,
    }]
  })

  const existingRecommendations = Array.isArray(input.output.recommendations) ? input.output.recommendations : []
  const enriched = {
    ...input.output,
    recommendations: dedupeRecommendations([...existingRecommendations, ...learnedRecommendations]),
    memoryContext: {
      query,
      durableMemoryMatches: prior.memories.length,
      learningCaseMatches: prior.learningCases.length,
      workedCases: workedCases.map((item: Record<string, unknown>) => ({
        id: item.id,
        problem_type: item.problem_type,
        outcome_status: item.outcome_status,
        effectiveness: item.effectiveness,
        recommendation: item.recommendation,
        confidence: item.confidence,
      })),
      avoidCases: failedCases.map((item: Record<string, unknown>) => ({
        id: item.id,
        problem_type: item.problem_type,
        outcome_status: item.outcome_status,
        effectiveness: item.effectiveness,
        recommendation: item.recommendation,
        confidence: item.confidence,
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
      use_successful_prior_cases: true,
      suppress_failed_prior_actions: true,
      human_validated_semantic_memory_required_for_high_risk_action: true,
      note: 'Prior cases inform recommendations only; they never authorize a production mutation.',
    },
  }

  const admin = createAdminClient()
  const { error: updateError } = await admin.schema('agent').from('agent_runs').update({ output: enriched }).eq('id', input.agentRunId)
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
      learning_case_ids: prior.learningCases.map((item: Record<string, unknown>) => item.id),
      worked_case_ids: workedCases.map((item: Record<string, unknown>) => item.id),
      avoided_case_ids: failedCases.map((item: Record<string, unknown>) => item.id),
    },
  })

  return enriched
}
