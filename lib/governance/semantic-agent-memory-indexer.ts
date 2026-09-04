import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSemanticObject, indexSemanticObject } from '@/lib/governance/semantic-search'

type AgentMemoryRow = {
  id: string
  agent_definition_id: string
  source_agent_run_id: string | null
  memory_key: string
  memory_type: string
  content: Record<string, unknown>
  confidence: number | null
  expires_at: string | null
  updated_at: string
}

function memoryContent(memory: AgentMemoryRow) {
  return [
    memory.memory_key,
    `Memory type: ${memory.memory_type}`,
    memory.confidence === null ? null : `Confidence: ${memory.confidence}`,
    JSON.stringify(memory.content),
  ].filter(Boolean).join('\n')
}

export async function reindexProjectAgentMemories(projectId: string, options: { concurrency?: number } = {}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: memories, error: memoryError } = await admin
    .schema('agent')
    .from('agent_memories')
    .select('id,agent_definition_id,source_agent_run_id,memory_key,memory_type,content,confidence,expires_at,updated_at')
    .eq('project_id', projectId)
    .eq('status', 'ACTIVE')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (memoryError) throw new Error(`Unable to collect governed agent memories: ${memoryError.message}`)

  const rows = (memories ?? []) as AgentMemoryRow[]
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3))
  let cursor = 0
  let indexed = 0
  let failed = 0
  const errors: string[] = []

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++
      const memory = rows[index]
      try {
        await indexSemanticObject({
          projectId,
          objectType: 'AGENT_MEMORY',
          objectKey: memory.id,
          objectId: memory.id,
          content: memoryContent(memory),
          metadata: {
            agent_definition_id: memory.agent_definition_id,
            source_agent_run_id: memory.source_agent_run_id,
            memory_key: memory.memory_key,
            memory_type: memory.memory_type,
            confidence: memory.confidence,
            expires_at: memory.expires_at,
          },
        })
        indexed += 1
      } catch (error) {
        failed += 1
        errors.push(error instanceof Error ? error.message : 'Agent memory semantic indexing failed.')
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, () => worker()))

  const activeKeys = new Set(rows.map((row) => row.id))
  const { data: existing, error: existingError } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('object_key')
    .eq('project_id', projectId)
    .eq('object_type', 'AGENT_MEMORY')
  if (existingError) throw new Error(`Unable to inspect indexed agent memories: ${existingError.message}`)

  let pruned = 0
  for (const row of existing ?? []) {
    const key = String(row.object_key)
    if (activeKeys.has(key)) continue
    await deleteSemanticObject({ projectId, objectType: 'AGENT_MEMORY', objectKey: key })
    pruned += 1
  }

  return { indexed, failed, pruned, errors: errors.slice(0, 20) }
}
