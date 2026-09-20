import { createHash } from 'node:crypto'
import { reindexProjectAgentLearningCases } from '@/lib/governance/semantic-agent-learning-indexer'
import { indexCatalogMetadataSemanticBatch } from '@/lib/governance/catalog-metadata-semantic-indexer'
import { CATALOG_METADATA_INDEX_TRIGGER, CATALOG_METADATA_INDEX_VERSION } from '@/lib/governance/catalog-metadata-semantic-contract'
import { reindexProjectAgentMemories } from '@/lib/governance/semantic-agent-memory-indexer'
import { reindexProjectDocumentSemanticObjects } from '@/lib/governance/semantic-document-indexer'
import { reindexProjectKnowledgeSemanticObjects } from '@/lib/governance/semantic-knowledge-indexer'
import { reindexProjectSemanticObjects } from '@/lib/governance/semantic-indexer'
import {
  enqueueDurableJob,
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

function cursorHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 24)
}

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

      const trigger = typeof job.payload?.trigger === 'string' ? job.payload.trigger.trim() : ''
      if (trigger === CATALOG_METADATA_INDEX_TRIGGER) {
        const batch = await indexCatalogMetadataSemanticBatch({
          projectId,
          cursor: job.payload?.cursor,
          assetBatchSize: 25,
          candidateBudget: 500,
          concurrency: 4,
        })
        if (batch.failed > 0) {
          const failures = batch.results
            .filter((result) => result.status === 'FAILED')
            .flatMap((result) => result.error ? [result.error] : [])
            .slice(0, 5)
          throw new Error(
            `Catalog metadata semantic indexing failed for ${batch.failed} object(s)${failures.length ? `: ${failures.join(' | ')}` : '.'}`,
          )
        }

        if (!batch.complete && batch.nextCursor) {
          const day = typeof job.payload?.day === 'string' && job.payload.day.trim()
            ? job.payload.day.trim()
            : new Date().toISOString().slice(0, 10)
          const version = typeof job.payload?.version === 'string' && job.payload.version.trim()
            ? job.payload.version.trim()
            : CATALOG_METADATA_INDEX_VERSION
          await enqueueDurableJob({
            projectId,
            jobType: 'SEMANTIC_INDEX',
            entityId: projectId,
            idempotencyKey: `semantic-catalog:${version}:${projectId}:${day}:${cursorHash(batch.nextCursor)}`,
            payload: {
              projectId,
              trigger: CATALOG_METADATA_INDEX_TRIGGER,
              day,
              version,
              cursor: batch.nextCursor,
            },
            priority: 165,
            maxAttempts: 3,
          })
        }

        await markDurableJobSucceeded(job)
        results.push({
          jobId: job.id,
          projectId,
          status: 'SUCCEEDED',
          trigger: CATALOG_METADATA_INDEX_TRIGGER,
          indexed: batch.indexed,
          failed: batch.failed,
          complete: batch.complete,
          nextCursor: batch.nextCursor,
        })
        continue
      }

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
