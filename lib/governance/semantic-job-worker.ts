import { reindexProjectDocumentSemanticObjects } from '@/lib/governance/semantic-document-indexer'
import { reindexProjectSemanticObjects } from '@/lib/governance/semantic-indexer'
import {
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

export async function processSemanticIndexJobs(jobs: DurableJob[]) {
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    try {
      const projectId = typeof job.payload?.projectId === 'string' && job.payload.projectId.trim()
        ? job.payload.projectId.trim()
        : job.project_id
      if (!projectId) throw new Error('Semantic indexing job is missing projectId.')

      const [governance, documents] = await Promise.all([
        reindexProjectSemanticObjects(projectId, { concurrency: 3 }),
        reindexProjectDocumentSemanticObjects(projectId, { concurrency: 3 }),
      ])
      await markDurableJobSucceeded(job)
      results.push({
        jobId: job.id,
        projectId,
        status: 'SUCCEEDED',
        indexed: governance.indexed + documents.indexed,
        failed: governance.failed + documents.failed,
        pruned: governance.pruned + documents.pruned,
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
