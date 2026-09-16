import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectBelongsToInstanceOrganization } from '@/lib/governance/instance-organization'
import { parseProfilingGovernanceInsightRow, type ProfilingGovernanceInsight } from '@/lib/profiling/governance-insight-parser'

export async function listProfilingGovernanceInsights(projectId: string, limit = 50): Promise<ProfilingGovernanceInsight[]> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('limit must be between 1 and 500')

  await assertProjectBelongsToInstanceOrganization(normalizedProjectId)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('profiling')
    .from('profile_run_governance_insights')
    .select('*')
    .eq('project_id', normalizedProjectId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Unable to load profiling governance insights: ${error.message}`)
  return (data ?? []).map((row) => parseProfilingGovernanceInsightRow(row as Record<string, unknown>))
}
