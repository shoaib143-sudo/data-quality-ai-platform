import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { createAdminClient } from '@/lib/supabase/admin'

export function semanticEmbeddingConfigured() {
  return Boolean(
    process.env.GOVERNANCE_EMBEDDING_URL?.trim()
    || process.env.AI_GATEWAY_API_KEY?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim(),
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
  for (const project of projects ?? []) {
    await enqueueDurableJob({
      projectId: String(project.id),
      jobType: 'SEMANTIC_INDEX',
      entityId: String(project.id),
      idempotencyKey: `semantic-index:${project.id}:${day}`,
      payload: { projectId: String(project.id), trigger: 'DAILY_SEMANTIC_INDEX', day },
      priority: 160,
      maxAttempts: 3,
    })
    queued += 1
  }

  return { configured: true, queued, projects: projects?.length ?? 0, skipped: false }
}
