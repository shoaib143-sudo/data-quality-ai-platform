import { reindexProjectAgentLearningCases } from '@/lib/governance/semantic-agent-learning-indexer'
import { reindexProjectAgentMemories } from '@/lib/governance/semantic-agent-memory-indexer'
import { reindexProjectDocumentSemanticObjects } from '@/lib/governance/semantic-document-indexer'
import { reindexProjectKnowledgeSemanticObjects } from '@/lib/governance/semantic-knowledge-indexer'
import { reindexProjectSemanticObjects } from '@/lib/governance/semantic-indexer'
import {
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

function failureDetails(groups: Array<[string, unknown]>) {
  const details: string[] = []
  for (const [label, value] of groups) {
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    if (Array.isArray(record.results)) {
      for (const row of record.results) {
        if (!row || typeof row !== 'object') continue
        const error = (row as Record<string, unknown>).error
        if (typeof error === 'string' && error.trim()) details.push(`${label}: ${error.trim()}`)
      }
    }
    if (Array.isArray(record.errors)) {
      for (const error of record.errors) {
        if (typeof error === 'string' && error.trim()) details.push(`${label}: ${error.trim()}`)
      }
    }
  }
  return [...new Set(details)].slice(0, 5)
}

export async function processSemanticIndexJobs(jobs: DurableJob[]) {
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    try {
      const projectId = typeof job.payload?.projectId === 'string' && job.payload.projectId.trim()
        ? job.payload.projectId.trim()
        : job.project_id
      if (!projectId) throw new Error('Semantic indexing job is missing projectId.')

      const [governance, documents, knowledge, agentMemories, agentLearning] = await Promise.all([
        reindexProjectSemanticObjects(projectId, { concurrency: 3 }),
        reindexProjectDocumentSemanticObjects(projectId, { concurrency: 3 }),
        reindexProjectKnowledgeSemanticObjects(projectId, { concurrency: 3 }),
        reindexProjectAgentMemories(projectId, { concurrency: 3 }),
        reindexProjectAgentLearningCases(projectId, { concurrency: 3 }),
      ])
      const failed = governance.failed + documents.failed + knowledge.failed + agentMemories.failed + agentLearning.failed
      if (failed > 0) {
        const details = failureDetails([
          ['governance', governance],
          ['documents', documents],
          ['knowledge', knowledge],
          ['agent memories', agentMemories],
          ['agent learning', agentLearning],
        ])
        throw new Error(`Semantic indexing failed for ${failed} object(s)${details.length ? `: ${details.join(' | ')}` : '.'}`)
      }

      await markDurableJobSucceeded(job)
      results.push({
        jobId: job.id,
        projectId,
        status: 'SUCCEEDED',
        indexed: governance.indexed + documents.indexed + knowledge.indexed + agentMemories.indexed + agentLearning.indexed,
        failed,
        pruned: governance.pruned + documents.pruned + knowledge.pruned + agentMemories.pruned + agentLearning.pruned,
      })
    } catch (error) {
      await markDurableJobFailed(job, error)
      results.push({
        jobId: job.id,
        projectId: job.project_id,
        status: job.attempts >= job.max_attempts ? 'DEAD' : 'RETRY',
        error: error instanceof Error ? error.message : 'Semantic indexing job failed.',
      })
    }
  }
  return results
}
