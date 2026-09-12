import { createAdminClient } from '@/lib/supabase/admin'

export type FindingIssueIdentity = {
  id: string
  project_id: string
  dataset_id: string | null
  dataset_version_id: string | null
  profile_run_id: string | null
  finding_id: string | null
  quality_rule_run_id: string | null
  title: string
  severity: string
  status: string
  owner_user_id: string | null
  created_at: string
  updated_at: string
}

export async function findIssueByFindingIdentity(projectId: string, findingId: string): Promise<FindingIssueIdentity | null> {
  if (!projectId || !findingId) return null
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('issues')
    .select('id,project_id,dataset_id,dataset_version_id,profile_run_id,finding_id,quality_rule_run_id,title,severity,status,owner_user_id,created_at,updated_at')
    .eq('project_id', projectId)
    .eq('finding_id', findingId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve finding issue identity: ${error.message}`)
  return data as FindingIssueIdentity | null
}

export function isFindingIdentityConflict(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23505' && String(error.message ?? '').includes('issues_finding_identity')
}
