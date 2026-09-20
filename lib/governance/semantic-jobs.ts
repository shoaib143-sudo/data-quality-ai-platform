import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { createAdminClient } from '@/lib/supabase/admin'

const SEMANTIC_INDEX_JOB_VERSION = 'v5'
const CATALOG_METADATA_INDEX_VERSION = 'v1'

export function semanticEmbeddingConfigured() {
  const supabaseNative = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  )
  return Boolean(
    process.env.GOVERNANCE_EMBEDDING_URL?.trim()
    || supabaseNative
    || process.env.AI_GATEWAY_API_KEY?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim()
    || process.env.VERCEL === '1',
  )
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export async function enqueueDailySemanticIndexJobs(limit = 100) {
  if (!semanticEmbeddingConfigured()) {
    return { configured: false, queued: 0, projects: 0, skipped: true }
  }

  const admin = createAdminClient()
  const { data: projects, error } = await admin
    .schema('app')
    .from('projects')
    .select('id')
    .order('created_at')
    .limit(Math.max(1, Math.min(limit, 500)))
  if (error) throw new Error(`Unable to enumerate semantic indexing projects: ${error.message}`)

  const day = utcDayKey()
  let queued = 0
  let catalogQueued = 0
  for (const project of projects ?? []) {
    const projectId = String(project.id)
    await enqueueDurableJob({
      projectId,
      jobType: 'SEMANTIC_INDEX',
      entityId: projectId,
      idempotencyKey: `semantic-index:${SEMANTIC_INDEX_JOB_VERSION}:${project.id}:${day}`,
      payload: { projectId, trigger: 'DAILY_SEMANTIC_INDEX', day, version: SEMANTIC_INDEX_JOB_VERSION },
      priority: 160,
      maxAttempts: 3,
    })
    queued += 1

    await enqueueDurableJob({
      projectId,
      jobType: 'SEMANTIC_INDEX',
      entityId: projectId,
      idempotencyKey: `semantic-catalog:${CATALOG_METADATA_INDEX_VERSION}:${project.id}:${day}:root`,
      payload: {
        projectId,
        trigger: 'CATALOG_METADATA_INDEX',
        day,
        version: CATALOG_METADATA_INDEX_VERSION,
        cursor: null,
      },
      priority: 165,
      maxAttempts: 3,
    })
    queued += 1
    catalogQueued += 1
  }

  return {
    configured: true,
    queued,
    catalogQueued,
    projects: projects?.length ?? 0,
    skipped: false,
  }
}
