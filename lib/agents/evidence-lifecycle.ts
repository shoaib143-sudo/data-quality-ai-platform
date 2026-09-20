import { hasProjectCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLandingAccess } from '@/lib/governance/landing-access'

export type AgentEvidenceType = 'ARTIFACT' | 'MESSAGE' | 'AUDIT_RECORD'

const DEFAULT_RETENTION_YEARS = 7
const MIN_RETENTION_YEARS = 5
const MAX_RETENTION_YEARS = 7

function assertRetentionYears(value: number) {
  if (!Number.isInteger(value) || value < MIN_RETENTION_YEARS || value > MAX_RETENTION_YEARS) {
    throw new Error(`Agent evidence retention must be between ${MIN_RETENTION_YEARS} and ${MAX_RETENTION_YEARS} years.`)
  }
}

async function assertGovernanceAdminLegalHoldAuthority(actorUserId: string, projectId: string) {
  const access = await resolveLandingAccess(actorUserId)
  if (access.persona !== 'data-governance-admin') {
    throw new Error('Data Governance Admin authority is required to manage agent evidence legal holds.')
  }
  if (!(await hasProjectCapability(actorUserId, projectId, 'admin.manage'))) {
    throw new Error('admin.manage is required for the legal-hold project scope.')
  }
}

async function assertEvidenceProject(input: {
  projectId: string
  evidenceType: AgentEvidenceType
  evidenceId: string
}) {
  const admin = createAdminClient()
  if (input.evidenceType === 'ARTIFACT') {
    const { data: artifact, error } = await admin.schema('agent').from('agent_artifacts')
      .select('agent_run_id').eq('id', input.evidenceId).maybeSingle()
    if (error) throw new Error(`Unable to resolve agent artifact scope: ${error.message}`)
    if (!artifact?.agent_run_id) throw new Error('Agent artifact was not found.')
    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs')
      .select('project_id').eq('id', artifact.agent_run_id).maybeSingle()
    if (runError) throw new Error(`Unable to resolve agent artifact project: ${runError.message}`)
    if (!run || run.project_id !== input.projectId) throw new Error('Agent artifact is outside the requested project.')
    return
  }

  if (input.evidenceType === 'MESSAGE') {
    const { data: message, error } = await admin.schema('agent').from('agent_messages')
      .select('source_agent_run_id,target_agent_run_id').eq('id', input.evidenceId).maybeSingle()
    if (error) throw new Error(`Unable to resolve agent message scope: ${error.message}`)
    if (!message) throw new Error('Agent message was not found.')
    const runIds = [...new Set([message.source_agent_run_id, message.target_agent_run_id].filter(Boolean))] as string[]
    if (!runIds.length) throw new Error('Agent message has no governed run scope.')
    const { data: runs, error: runsError } = await admin.schema('agent').from('agent_runs')
      .select('id,project_id').in('id', runIds)
    if (runsError) throw new Error(`Unable to resolve agent message projects: ${runsError.message}`)
    if ((runs ?? []).length !== runIds.length || (runs ?? []).some(run => run.project_id !== input.projectId)) {
      throw new Error('Agent message is outside the requested project.')
    }
    return
  }

  const { data: auditEvent, error: auditError } = await admin.schema('governance').from('audit_events')
    .select('id,project_id,event_hash,chain_version,chain_sequence')
    .eq('id', input.evidenceId)
    .maybeSingle()
  if (auditError) throw new Error(`Unable to resolve immutable audit record scope: ${auditError.message}`)
  if (!auditEvent) throw new Error('Immutable audit record was not found.')
  if (!auditEvent.event_hash || Number(auditEvent.chain_version ?? 0) < 1) {
    throw new Error('Audit record does not satisfy immutable audit-chain requirements.')
  }
  if (auditEvent.project_id !== input.projectId) throw new Error('Audit record is outside the requested project.')
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
  const { error } = await admin.schema('agent').rpc('set_evidence_retention_policy_internal', {
    p_project_id: input.projectId,
    p_retention_years: input.retentionYears,
    p_updated_by: input.actorUserId,
  })
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
  await assertGovernanceAdminLegalHoldAuthority(input.actorUserId, input.projectId)

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('place_evidence_legal_hold_internal', {
    p_project_id: input.projectId,
    p_evidence_type: input.evidenceType,
    p_evidence_id: input.evidenceId,
    p_reason: reason,
    p_placed_by: input.actorUserId,
  })
  if (error) throw new Error(`Unable to place agent evidence legal hold: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) throw new Error('Agent evidence legal hold persistence returned incomplete evidence.')
  return row
}

export async function releaseAgentEvidenceLegalHold(input: {
  actorUserId: string
  projectId: string
  holdId: string
}) {
  await assertGovernanceAdminLegalHoldAuthority(input.actorUserId, input.projectId)

  const admin = createAdminClient()
  const { data: hold, error: holdError } = await admin.schema('agent').from('evidence_legal_holds')
    .select('id,project_id,active').eq('id', input.holdId).maybeSingle()
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
  await assertEvidenceProject(input)
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


export async function cleanupExpiredAgentEvidence(limit = 50) {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('cleanup_expired_evidence_internal', {
    p_limit: boundedLimit,
  })
  if (error) throw new Error(`Unable to enforce agent evidence retention: ${error.message}`)

  const results = (data ?? []).map((row: Record<string, unknown>) => ({
    evidenceType: String(row.evidence_type ?? ''),
    evidenceId: String(row.evidence_id ?? ''),
    disposition: String(row.disposition ?? 'UNKNOWN'),
    detail: typeof row.detail === 'string' ? row.detail : null,
  }))

  return {
    examined: results.length,
    deleted: results.filter((row) => row.disposition === 'DELETED').length,
    held: results.filter((row) => row.disposition === 'LEGAL_HOLD').length,
    governanceReferenced: results.filter((row) => row.disposition === 'GOVERNANCE_REFERENCE').length,
    storageBacked: results.filter((row) => row.disposition === 'STORAGE_BACKED').length,
    results,
  }
}
