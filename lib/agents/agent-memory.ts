import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numeric(value: unknown, fallback: number | null = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function persistAgentWorkingMemory(input: {
  projectId: string
  agentRunId: string
  memoryKey: string
  content: Record<string, unknown>
  ttlMinutes?: number
}) {
  const admin = createAdminClient()
  const now = new Date()
  const ttlMinutes = Math.max(5, Math.min(24 * 60, input.ttlMinutes ?? 120))
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
  const { data, error } = await admin.schema('agent').from('agent_working_memory').upsert({
    project_id: input.projectId,
    agent_run_id: input.agentRunId,
    memory_key: input.memoryKey,
    content: input.content,
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  }, { onConflict: 'agent_run_id,memory_key' }).select('id,memory_key,expires_at').single()
  if (error) throw new Error(`Unable to persist agent working memory: ${error.message}`)
  return data
}

export async function retrieveRelevantAgentMemory(input: {
  projectId: string
  agentDefinitionId?: string | null
  query: string
  limit?: number
}) {
  const admin = createAdminClient()
  const query = input.query.trim().toLowerCase()
  const limit = Math.max(1, Math.min(25, input.limit ?? 10))
  let memoryQuery = admin
    .schema('agent')
    .from('agent_memories')
    .select('id,agent_definition_id,source_agent_run_id,memory_key,memory_type,content,confidence,promoted_at,expires_at,updated_at')
    .eq('project_id', input.projectId)
    .eq('status', 'ACTIVE')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (input.agentDefinitionId) memoryQuery = memoryQuery.eq('agent_definition_id', input.agentDefinitionId)
  const { data: memories, error: memoryError } = await memoryQuery
  if (memoryError) throw new Error(`Unable to retrieve durable agent memory: ${memoryError.message}`)

  const rankedMemories = (memories ?? []).map((memory) => {
    const searchable = `${memory.memory_key} ${JSON.stringify(memory.content)}`.toLowerCase()
    const terms = query.split(/\s+/).filter((term) => term.length > 2)
    const matches = terms.filter((term) => searchable.includes(term)).length
    const score = terms.length ? matches / terms.length : 0
    return { ...memory, relevance: score }
  }).filter((memory) => !query || memory.relevance > 0).sort((a, b) => b.relevance - a.relevance || String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, limit)

  const { data: cases, error: casesError } = query
    ? await admin.schema('agent').rpc('search_learning_cases', {
        p_project_id: input.projectId,
        p_query: query,
        p_limit: limit,
      })
    : { data: [], error: null }
  if (casesError) throw new Error(`Unable to retrieve agent learning cases: ${casesError.message}`)

  return { memories: rankedMemories, learningCases: cases ?? [] }
}

async function upsertDurableMemory(input: {
  projectId: string
  agentDefinitionId: string
  sourceAgentRunId: string
  memoryKey: string
  memoryType: 'OBSERVATION' | 'SUMMARY' | 'DECISION' | 'EVIDENCE' | 'PREFERENCE' | 'EPISODE' | 'SEMANTIC'
  content: Record<string, unknown>
  confidence: number
  expiresAt?: string | null
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const contentHash = digest(input.content)
  const { data: existing, error: existingError } = await admin
    .schema('agent')
    .from('agent_memories')
    .select('id')
    .eq('project_id', input.projectId)
    .eq('agent_definition_id', input.agentDefinitionId)
    .eq('memory_key', input.memoryKey)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve active agent memory: ${existingError.message}`)

  if (existing) {
    const { data, error } = await admin.schema('agent').from('agent_memories').update({
      source_agent_run_id: input.sourceAgentRunId,
      memory_type: input.memoryType,
      content: input.content,
      confidence: input.confidence,
      content_hash: contentHash,
      promoted_at: now,
      expires_at: input.expiresAt ?? null,
      updated_at: now,
    }).eq('id', existing.id).select('id,memory_key,memory_type,content_hash').single()
    if (error) throw new Error(`Unable to refresh agent memory: ${error.message}`)
    return data
  }

  const { data, error } = await admin.schema('agent').from('agent_memories').insert({
    project_id: input.projectId,
    agent_definition_id: input.agentDefinitionId,
    source_agent_run_id: input.sourceAgentRunId,
    memory_key: input.memoryKey,
    memory_type: input.memoryType,
    content: input.content,
    confidence: input.confidence,
    content_hash: contentHash,
    status: 'ACTIVE',
    promoted_at: now,
    expires_at: input.expiresAt ?? null,
  }).select('id,memory_key,memory_type,content_hash').single()
  if (error) throw new Error(`Unable to promote agent memory: ${error.message}`)
  return data
}

function relationshipCandidates(output: Record<string, unknown>) {
  const candidates: Array<{ targetType: string; targetKey: string; relationship: string; confidence: number; evidence: Record<string, unknown> }> = []
  const knowledge = output.knowledge && typeof output.knowledge === 'object' && !Array.isArray(output.knowledge)
    ? output.knowledge as Record<string, unknown>
    : {}
  const matches = Array.isArray(knowledge.matches) ? knowledge.matches : []
  for (const item of matches.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const targetType = text(record.object_type)
    const targetKey = text(record.object_key)
    if (!targetType || !targetKey) continue
    candidates.push({
      targetType,
      targetKey,
      relationship: 'GROUNDED_IN',
      confidence: Math.max(0, Math.min(1, numeric(record.relevance, 0.7) ?? 0.7)),
      evidence: { title: record.title ?? null, relevance: record.relevance ?? null },
    })
  }
  const specialist = output.specialist && typeof output.specialist === 'object' && !Array.isArray(output.specialist)
    ? output.specialist as Record<string, unknown>
    : {}
  const evidence = specialist.evidence && typeof specialist.evidence === 'object' && !Array.isArray(specialist.evidence)
    ? specialist.evidence as Record<string, unknown>
    : {}
  for (const [key, value] of Object.entries(evidence)) {
    if (!Array.isArray(value)) continue
    for (const item of value.slice(0, 5)) {
      if (!item || typeof item !== 'object') continue
      const id = text((item as Record<string, unknown>).id)
      if (!id) continue
      candidates.push({
        targetType: key.toUpperCase(),
        targetKey: id,
        relationship: 'SUPPORTED_BY',
        confidence: Math.max(0.5, Math.min(1, numeric(output.confidence, 0.75) ?? 0.75)),
        evidence: { specialist_evidence_key: key },
      })
    }
  }
  return candidates.slice(0, 40)
}

async function persistMemoryRelationships(projectId: string, memoryId: string, output: Record<string, unknown>) {
  const admin = createAdminClient()
  const candidates = relationshipCandidates(output)
  if (!candidates.length) return 0
  const rows = candidates.map((candidate) => ({
    project_id: projectId,
    memory_id: memoryId,
    relationship_type: candidate.relationship,
    target_type: candidate.targetType,
    target_key: candidate.targetKey,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
  }))
  const { error } = await admin.schema('agent').from('agent_memory_relationships').upsert(rows, {
    onConflict: 'memory_id,relationship_type,target_type,target_key',
  })
  if (error) throw new Error(`Unable to persist relational agent memory: ${error.message}`)
  return rows.length
}

export async function persistGovernedAgentMemoryAndEvaluation(input: {
  projectId: string
  agentDefinitionId: string
  agentRunId: string
  agentKey: string
  output: Record<string, unknown>
}) {
  const now = new Date()
  const outputConfidence = Math.max(0, Math.min(1, numeric(input.output.confidence, 0.8) ?? 0.8))
  const summaryContent = {
    agent: input.output.agent ?? null,
    generatedAt: input.output.generatedAt ?? now.toISOString(),
    observations: input.output.observations ?? [],
    recommendations: input.output.recommendations ?? [],
    hypotheses: input.output.hypotheses ?? [],
    priorities: input.output.priorities ?? [],
    confidence: outputConfidence,
    evidence_count: input.output.evidence_count ?? null,
    evidence_sources: input.output.evidence_sources ?? [],
    limitations: input.output.limitations ?? [],
  }
  const summaryExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString()
  const episodeExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString()
  const semanticExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString()

  const summary = await upsertDurableMemory({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    sourceAgentRunId: input.agentRunId,
    memoryKey: `project_summary:${input.agentKey}`,
    memoryType: 'SUMMARY',
    content: summaryContent,
    confidence: outputConfidence,
    expiresAt: summaryExpiresAt,
  })

  const episodeContent = {
    kind: 'GOVERNED_AGENT_EPISODE',
    agent_key: input.agentKey,
    agent_run_id: input.agentRunId,
    question: input.output.question ?? null,
    observations: input.output.observations ?? [],
    recommendations: input.output.recommendations ?? [],
    hypotheses: input.output.hypotheses ?? [],
    priorities: input.output.priorities ?? [],
    query_plan: input.output.queryPlan ?? {},
    confidence: outputConfidence,
    approval_status: input.output.approval_status ?? null,
  }
  const episode = await upsertDurableMemory({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    sourceAgentRunId: input.agentRunId,
    memoryKey: `episode:${input.agentRunId}`,
    memoryType: 'EPISODE',
    content: episodeContent,
    confidence: outputConfidence,
    expiresAt: episodeExpiresAt,
  })

  const semanticContent = {
    kind: 'EVIDENCE_DERIVED_SEMANTIC_MEMORY',
    agent_key: input.agentKey,
    observations: input.output.observations ?? [],
    recommendations: input.output.recommendations ?? [],
    evidence_sources: input.output.evidence_sources ?? [],
    derived_from_agent_run_id: input.agentRunId,
    human_validated: false,
    confidence: outputConfidence,
  }
  const semanticHash = digest(semanticContent).slice(0, 24)
  const semantic = await upsertDurableMemory({
    projectId: input.projectId,
    agentDefinitionId: input.agentDefinitionId,
    sourceAgentRunId: input.agentRunId,
    memoryKey: `semantic:${input.agentKey}:${semanticHash}`,
    memoryType: 'SEMANTIC',
    content: semanticContent,
    confidence: Math.min(outputConfidence, 0.9),
    expiresAt: semanticExpiresAt,
  })

  const relationships = await persistMemoryRelationships(input.projectId, episode.id, input.output)

  const evidenceCount = Math.max(0, numeric(input.output.evidence_count, 0) ?? 0)
  const { error: evaluationError } = await createAdminClient().schema('agent').from('agent_evaluations').upsert({
    project_id: input.projectId,
    agent_run_id: input.agentRunId,
    evaluator_type: 'SYSTEM_CONTRACT',
    evaluator_version: '2.0',
    score: 1,
    dimensions: {
      execution_succeeded: 1,
      read_only_boundary: 1,
      project_scope_enforced: 1,
      bounded_evidence: 1,
      specialist_reasoning_contract: input.output.reasoningContract ? 1 : 0,
      evidence_present: evidenceCount > 0 ? 1 : 0,
      confidence_present: input.output.confidence !== undefined ? 1 : 0,
    },
    feedback: {
      evaluation_kind: 'operational_contract',
      note: 'This score measures execution-contract compliance, not semantic answer quality.',
      evidence_count: evidenceCount,
      output_confidence: outputConfidence,
    },
  }, { onConflict: 'agent_run_id,evaluator_type,evaluator_version' })
  if (evaluationError) throw new Error(`Unable to persist agent evaluation: ${evaluationError.message}`)

  return {
    memoryKey: summary.memory_key,
    contentHash: summary.content_hash,
    expiresAt: summaryExpiresAt,
    episodeMemoryId: episode.id,
    semanticMemoryId: semantic.id,
    relationships,
  }
}
