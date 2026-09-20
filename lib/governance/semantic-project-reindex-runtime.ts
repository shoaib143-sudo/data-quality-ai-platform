import { reindexProjectAgentLearningCases } from '@/lib/governance/semantic-agent-learning-indexer'
import { reindexProjectAgentMemories } from '@/lib/governance/semantic-agent-memory-indexer'
import { reindexProjectDocumentSemanticObjects } from '@/lib/governance/semantic-document-indexer'
import { reindexProjectKnowledgeSemanticObjects } from '@/lib/governance/semantic-knowledge-indexer'
import { reindexProjectSemanticObjects } from '@/lib/governance/semantic-indexer'
import {
  reindexProjectSemanticCorpus,
  type ReindexDependencies,
} from '@/lib/governance/semantic-project-reindex'

const dependencies: ReindexDependencies = {
  governance: reindexProjectSemanticObjects,
  documents: reindexProjectDocumentSemanticObjects,
  knowledge: reindexProjectKnowledgeSemanticObjects,
  agentMemories: reindexProjectAgentMemories,
  agentLearning: reindexProjectAgentLearningCases,
}

export function reindexProjectSemanticCorpusWithRuntime(
  projectId: string,
  options: { concurrency?: number } = {},
) {
  return reindexProjectSemanticCorpus(projectId, options, dependencies)
}
