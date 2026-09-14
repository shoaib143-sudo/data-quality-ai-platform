import { hasProjectCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export type AgentEvidenceType = 'ARTIFACT' | 'MESSAGE' | 'AUDIT_RECORD'

const DEFAULT_RETENTION_YEARS = 7
const MIN_RETENTION_YEARS = 5
const MAX_RETENTION_YEARS = 7

function assertRetentionYears(value: number) {
  if (!Number.isInteger(value) || value < MIN_RETENTION_YEARS || value > MAX_RETENTION_YEARS) {
    throw new Error(`Agent evidence retention must be between ${MIN_RETENTION_YEARS} and ${MAX_RETENTION_YEARS} years.`)
  }
}

export async function effectiveAgentEvidenceRetentionYears(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('evidence_retention_policies')
    .select('retention_years')
    .eq('project_id', projectId)
    .eq('active', true)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve agent evidence retention policy: ${error.message}`)
  const years = data?.retention_years ?? DEFAULT_RETENTION_YEARS
  assertRetentionYears(years)
  return years
}

export async function updateAgentEvidenceRetentionPolicy(input: {
  actorUserId: string
  projectId: string
  retentionYears: number
}) {
  assertRetentionYears(input.retentionYears)
  if (!(await hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage'))) {
    throw new Error('admin.manage is required to change agent evidence retention.')
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.schema('agent').from('evidence_retention_policies').upsert({
    project_id: input.projectId,
    retention_years: input.retentionYears,
    active: true,
    updated_by: input.actorUserId,
    updated_at: now,
  }, { onConflict: 'project_id' })
  if (error) throw new Error(`Unable to update agent evidence retention policy: ${error.message}`)

  return { projectId: input.projectId, retentionYears: input.retentionYears }
}

export async function placeAgentEvidenceLegalHold(input: {
  actorUserId: string
  projectId: string
  evidenceType: AgentEvidenceType
  evidenceId: string
  reason: string
}) {
  const reason = input.reason.trim()
  if (!reason) throw new Error('A legal-hold reason is required.')
  if (!(await hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage'))) {
    throw new Error('admin.manage is required to place an agent evidence legal hold.')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('evidence_legal_holds').insert({
    project_id: input.projectId,
    evidence_type: input.evidenceType,
    evidence_id: input.evidenceId,
    reason,
    active: true,
    placed_by: input.actorUserId,
  }).select('id,project_id,evidence_type,evidence_id,reason,placed_by,placed_at').single()
  if (error || !data) throw new Error(`Unable to place agent evidence legal hold: ${error?.message ?? 'unknown error'}`)
  return data
}

export async function releaseAgentEvidenceLegalHold(input: {
  actorUserId: string
  projectId: string
  holdId: string
}) {
  if (!(await hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage'))) {
    throw new Error('admin.manage is required to release an agent evidence legal hold.')
  }

  const admin = createAdminClient()
  const { data: hold, error: holdError } = await admin.schema('agent').from('evidence_legal_holds')
    .select('id,project_id,active')
    .eq('id', input.holdId)
    .maybeSingle()
  if (holdError) throw new Error(`Unable to resolve agent evidence legal hold: ${holdError.message}`)
  if (!hold || hold.project_id !== input.projectId || !hold.active) throw new Error('Active legal hold not found in the requested project.')

  const releasedAt = new Date().toISOString()
  const { error } = await admin.schema('agent').from('evidence_legal_holds').update({
    active: false,
    released_by: input.actorUserId,
    released_at: releasedAt,
  }).eq('id', input.holdId).eq('active', true)
  if (error) throw new Error(`Unable to release agent evidence legal hold: ${error.message}`)

  return { holdId: input.holdId, releasedAt }
}

export async function isAgentEvidenceDeletionBlocked(input: {
  projectId: string
  evidenceType: AgentEvidenceType
  evidenceId: string
  retentionUntil: string
}) {
  const retentionUntil = new Date(input.retentionUntil).getTime()
  if (!Number.isFinite(retentionUntil)) throw new Error('Agent evidence retention timestamp is invalid.')
  if (retentionUntil > Date.now()) return true

  const admin = createAdminClient()
  const { count, error } = await admin.schema('agent').from('evidence_legal_holds')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', input.projectId)
    .eq('evidence_type', input.evidenceType)
    .eq('evidence_id', input.evidenceId)
    .eq('active', true)
  if (error) throw new Error(`Unable to evaluate agent evidence legal hold: ${error.message}`)
  return (count ?? 0) > 0
}
