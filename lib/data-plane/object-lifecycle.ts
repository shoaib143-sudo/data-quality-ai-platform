import { SupabaseObjectStore } from '@/lib/data-plane/providers/supabase-object-store'
import { createAdminClient } from '@/lib/supabase/admin'

type ArtifactRow = {
  id: string
  project_id: string
  provider_key: string
  bucket: string
  object_key: string
  retention_until: string
}

function logicalKey(projectId: string, objectKey: string) {
  const prefix = `projects/${projectId}/`
  if (!objectKey.startsWith(prefix) || objectKey.length <= prefix.length) {
    throw new Error('Registered object key is outside its project prefix.')
  }
  return objectKey.slice(prefix.length)
}

export async function cleanupExpiredObjectArtifacts(limit = 25) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('orchestration')
    .from('object_artifacts')
    .select('id,project_id,provider_key,bucket,object_key,retention_until')
    .eq('lifecycle_status', 'ACTIVE')
    .not('retention_until', 'is', null)
    .lte('retention_until', new Date().toISOString())
    .order('retention_until')
    .limit(Math.max(1, Math.min(limit, 100)))
  if (error) throw new Error(`Unable to list expired object artifacts: ${error.message}`)

  const results: Array<Record<string, unknown>> = []
  for (const artifact of (data ?? []) as ArtifactRow[]) {
    try {
      if (artifact.provider_key !== 'supabase') {
        throw new Error(`Unsupported lifecycle provider ${artifact.provider_key}`)
      }
      const expectedBucket = (process.env.SUPABASE_OBJECT_STORE_BUCKET ?? 'governance-artifacts').trim()
      if (artifact.bucket !== expectedBucket) {
        throw new Error(`Artifact bucket ${artifact.bucket} does not match configured object-store bucket.`)
      }
      const store = new SupabaseObjectStore()
      await store.delete({ projectId: artifact.project_id }, logicalKey(artifact.project_id, artifact.object_key))
      results.push({ artifactId: artifact.id, projectId: artifact.project_id, status: 'DELETED' })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Object retention cleanup failed.'
      await admin.schema('orchestration').from('object_artifacts').update({
        lifecycle_status: 'FAILED',
        last_error: message.slice(0, 4000),
        updated_at: new Date().toISOString(),
      }).eq('id', artifact.id)
      results.push({ artifactId: artifact.id, projectId: artifact.project_id, status: 'FAILED', error: message })
    }
  }

  return {
    examined: data?.length ?? 0,
    deleted: results.filter((item) => item.status === 'DELETED').length,
    failed: results.filter((item) => item.status === 'FAILED').length,
    results,
  }
}
