import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceMemoryProvider } from '@/lib/ai/governance-memory-provider'

export type ApprovedPositiveLearningCase = {
  id: string
  candidate_id: string
  case_key: string
  problem_type: string
  context: Record<string, unknown>
  recommendation: Record<string, unknown>
  evidence: Record<string, unknown>
  updated_at: string
}

function terms(value: string) {
  return value.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 2)
}

function governedDurableMemoryEligible(memory: { memory_type?: unknown; content?: unknown }) {
  const memoryType = typeof memory.memory_type === 'string' ? memory.memory_type.trim().toUpperCase() : ''
  if (memoryType !== 'SEMANTIC') return true
  if (!memory.content || typeof memory.content !== 'object' || Array.isArray(memory.content)) return false
  return (memory.content as Record<string, unknown>).human_validated === true
}

export async function retrieveGovernedLearningContext(input: {
  projectId: string
  agentDefinitionId?: string | null
  query: string
  limit?: number
}) {
  const query = input.query.trim().toLowerCase()
  const limit = Math.max(1, Math.min(25, input.limit ?? 10))
  const admin = createAdminClient()

  let durableQuery = admin
    .schema('agent')
    .from('agent_memories')
    .select('id,agent_definition_id,source_agent_run_id,memory_key,memory_type,content,confidence,promoted_at,expires_at,updated_at')
    .eq('project_id', input.projectId)
    .eq('status', 'ACTIVE')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (input.agentDefinitionId) durableQuery = durableQuery.eq('agent_definition_id', input.agentDefinitionId)
  const { data: memories, error: memoryError } = await durableQuery
  if (memoryError) throw new Error(`Unable to retrieve durable agent memory: ${memoryError.message}`)

  const queryTerms = terms(query)
  const rankedMemories = (memories ?? [])
    .filter(governedDurableMemoryEligible)
    .map((memory) => {
      const searchable = `${memory.memory_key} ${JSON.stringify(memory.content)}`.toLowerCase()
      const matches = queryTerms.filter((term) => searchable.includes(term)).length
      const relevance = queryTerms.length ? matches / queryTerms.length : 0
      return { ...memory, relevance }
    })
    .filter((memory) => !query || memory.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit)

  const memoryProvider = createGovernanceMemoryProvider()
  const episodes = query
    ? await memoryProvider.retrieve({ projectId: input.projectId, classes: ['episodic'], limit: Math.min(limit * 3, 100) })
    : []

  const { data: positiveCases, error: positiveCaseError } = input.agentDefinitionId && query
    ? await admin.schema('agent').rpc('list_approved_positive_learning_cases', {
        p_project_id: input.projectId,
        p_agent_definition_id: input.agentDefinitionId,
        p_limit: Math.min(limit * 5, 100),
      })
    : { data: [], error: null }

  if (positiveCaseError) throw new Error(`Unable to retrieve approved positive learning cases: ${positiveCaseError.message}`)

  const approvedPositiveCases = ((positiveCases ?? []) as ApprovedPositiveLearningCase[])
    .map((learningCase) => {
      const searchable = [
        learningCase.case_key,
        learningCase.problem_type,
        JSON.stringify(learningCase.context),
        JSON.stringify(learningCase.recommendation),
        JSON.stringify(learningCase.evidence),
      ].join(' ').toLowerCase()
      const matches = queryTerms.filter((term) => searchable.includes(term)).length
      const relevance = queryTerms.length ? matches / queryTerms.length : 0
      return { ...learningCase, relevance }
    })
    .filter((learningCase) => learningCase.relevance > 0)
    .sort((left, right) =>
      right.relevance - left.relevance
      || String(right.updated_at).localeCompare(String(left.updated_at)))
    .slice(0, limit)

  const rankedEpisodes = episodes
    .map((episode) => {
      const searchable = `${episode.key} ${JSON.stringify(episode.content)}`.toLowerCase()
      const matches = queryTerms.filter((term) => searchable.includes(term)).length
      const relevance = queryTerms.length ? matches / queryTerms.length : 0
      return { ...episode, relevance }
    })
    .filter((episode) => !query || episode.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')))
    .slice(0, limit)

  return {
    memories: rankedMemories,
    verifiedEpisodes: rankedEpisodes,
    approvedPositiveCases,
  }
}
