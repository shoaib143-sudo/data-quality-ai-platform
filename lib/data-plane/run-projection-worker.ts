import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { runAnalyticsProjectionBatch } from '@/lib/data-plane/run-analytics-projection-batch'
import { runKnowledgeProjectionBatch } from '@/lib/data-plane/run-knowledge-projection-batch'
import { createAdminClient } from '@/lib/supabase/admin'

type BacklogRow = {
  project_id: string
  organization_id: string | null
  pending_events: number | string
  earliest_sequence: number | string
  latest_sequence: number | string
}

type ConsumerResult = {
  consumerKey: string
  projectId: string
  pendingEvents: number
  processed: number
  checkpoint: string | null
  skipped?: boolean
  error?: string
}

async function backlog(consumerKey: string, projectLimit: number) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .rpc('list_projection_backlog', {
      p_consumer_key: consumerKey,
      p_limit: Math.max(1, Math.min(projectLimit, 100)),
    })
  if (error) throw new Error(`Unable to list projection backlog for ${consumerKey}: ${error.message}`)
  return (data ?? []) as BacklogRow[]
}

function number(value: string | number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function runAnalytics(projectLimit: number, batchSize: number): Promise<ConsumerResult[]> {
  const { analytics } = getDataPlaneProviderSelection()
  const consumerKey = `analytics:${analytics}`
  const rows = await backlog(consumerKey, projectLimit)
  return Promise.all(rows.map(async (row) => {
    try {
      const result = await runAnalyticsProjectionBatch({
        projectId: row.project_id,
        organizationId: row.organization_id,
      }, batchSize)
      return {
        consumerKey,
        projectId: row.project_id,
        pendingEvents: number(row.pending_events),
        processed: result.processed,
        checkpoint: result.checkpoint,
      }
    } catch (error) {
      return {
        consumerKey,
        projectId: row.project_id,
        pendingEvents: number(row.pending_events),
        processed: 0,
        checkpoint: null,
        error: error instanceof Error ? error.message : 'Analytics projection failed',
      }
    }
  }))
}

async function runKnowledge(projectLimit: number, batchSize: number): Promise<ConsumerResult[]> {
  const { knowledgeSearch } = getDataPlaneProviderSelection()
  if (knowledgeSearch !== 'opensearch') return []

  const consumerKey = 'knowledge:opensearch'
  const rows = await backlog(consumerKey, projectLimit)
  return Promise.all(rows.map(async (row) => {
    try {
      const result = await runKnowledgeProjectionBatch({
        projectId: row.project_id,
        organizationId: row.organization_id,
      }, batchSize)
      return {
        consumerKey,
        projectId: row.project_id,
        pendingEvents: number(row.pending_events),
        processed: result.processed,
        checkpoint: result.checkpoint,
        skipped: result.skipped,
      }
    } catch (error) {
      return {
        consumerKey,
        projectId: row.project_id,
        pendingEvents: number(row.pending_events),
        processed: 0,
        checkpoint: null,
        error: error instanceof Error ? error.message : 'Knowledge projection failed',
      }
    }
  }))
}

export async function runProjectionWorker(options: { projectLimit?: number; batchSize?: number } = {}) {
  const projectLimit = Math.max(1, Math.min(options.projectLimit ?? 10, 25))
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 200, 500))
  const [analytics, knowledge] = await Promise.all([
    runAnalytics(projectLimit, batchSize),
    runKnowledge(projectLimit, batchSize),
  ])
  const results = [...analytics, ...knowledge]
  return {
    consumers: {
      analytics: getDataPlaneProviderSelection().analytics,
      knowledgeSearch: getDataPlaneProviderSelection().knowledgeSearch,
    },
    processed: results.reduce((sum, item) => sum + item.processed, 0),
    failures: results.filter((item) => item.error).length,
    results,
  }
}
