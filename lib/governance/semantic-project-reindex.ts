
type ReindexResult = {
  total?: number
  indexed: number
  unchanged?: number
  failed: number
  pruned: number
  [key: string]: unknown
}

export type ReindexDependencies = {
  governance: (projectId: string, options?: { concurrency?: number }) => Promise<ReindexResult>
  documents: (projectId: string, options?: { concurrency?: number }) => Promise<ReindexResult>
  knowledge: (projectId: string, options?: { concurrency?: number }) => Promise<ReindexResult>
  agentMemories: (projectId: string, options?: { concurrency?: number }) => Promise<ReindexResult>
  agentLearning: (projectId: string, options?: { concurrency?: number }) => Promise<ReindexResult>
}

function total(result: ReindexResult) {
  if (typeof result.total === 'number' && Number.isFinite(result.total)) return result.total
  return result.indexed + (result.unchanged ?? 0) + result.failed
}

export async function reindexProjectSemanticCorpus(
  projectId: string,
  options: { concurrency?: number } = {},
  dependencies: ReindexDependencies,
) {
  const concurrency = typeof options.concurrency === 'number' && Number.isFinite(options.concurrency)
    ? Math.max(1, Math.min(8, Math.trunc(options.concurrency)))
    : undefined

  const runOptions = concurrency ? { concurrency } : {}
  const [governance, documents, knowledge, agentMemories, agentLearning] = await Promise.all([
    dependencies.governance(projectId, runOptions),
    dependencies.documents(projectId, runOptions),
    dependencies.knowledge(projectId, runOptions),
    dependencies.agentMemories(projectId, runOptions),
    dependencies.agentLearning(projectId, runOptions),
  ])

  const groups = { governance, documents, knowledge, agentMemories, agentLearning }
  const values = Object.values(groups)
  return {
    projectId,
    total: values.reduce((sum, result) => sum + total(result), 0),
    indexed: values.reduce((sum, result) => sum + result.indexed, 0),
    unchanged: values.reduce((sum, result) => sum + (result.unchanged ?? 0), 0),
    failed: values.reduce((sum, result) => sum + result.failed, 0),
    pruned: values.reduce((sum, result) => sum + result.pruned, 0),
    groups,
  }
}
