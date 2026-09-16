import { createHash, randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildGovernanceOutcomeReport,
  type GovernanceOutcomeReport,
  type GovernanceOutcomeReportInput,
  type GovernanceRiskFinding,
  type ReportDepth,
  type ReportPersona,
} from '@/lib/orchestration/governance-outcome-report'

export type ReportingPreference = {
  enabled: boolean
  persona: ReportPersona
  depth: ReportDepth
}

export function normalizeReportingPreference(input: Partial<ReportingPreference> | null | undefined): ReportingPreference {
  const persona = input?.persona && ['EXECUTIVE','GOVERNANCE_COUNCIL','DATA_STEWARD','AUDIT'].includes(input.persona)
    ? input.persona
    : 'EXECUTIVE'
  const depth = input?.depth && ['EXECUTIVE','GOVERNANCE','AUDIT'].includes(input.depth)
    ? input.depth
    : 'EXECUTIVE'
  return { enabled: input?.enabled === true, persona, depth }
}

export async function persistRunReportingPreference(input: {
  projectId: string
  orchestratorRunId: string
  preference: ReportingPreference
}) {
  const admin = createAdminClient()
  const preference = normalizeReportingPreference(input.preference)
  const { error } = await admin.schema('governance').from('governance_orchestrator_runs').update({
    reporting_opt_in: preference.enabled,
    report_persona: preference.persona,
    report_depth: preference.depth,
  }).eq('id', input.orchestratorRunId).eq('project_id', input.projectId)
  if (error) throw new Error(`Unable to persist reporting preference: ${error.message}`)
  return preference
}

export async function persistGovernanceOutcomeReport(input: GovernanceOutcomeReportInput): Promise<GovernanceOutcomeReport> {
  const report = buildGovernanceOutcomeReport(input)
  const reportHash = createHash('sha256').update(report.reportHashInput).digest('hex')
  const admin = createAdminClient()
  const { error } = await admin.schema('governance').from('governance_outcome_reports').insert({
    id: report.reportId,
    project_id: report.projectId,
    orchestrator_run_id: report.orchestratorRunId,
    capability_run_id: report.capabilityRunId,
    schema_version: report.schemaVersion,
    persona: report.persona,
    depth: report.depth,
    report_hash: reportHash,
    report_payload: report,
  })
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    throw new Error(`Unable to persist governance outcome report: ${error.message}`)
  }
  return report
}

export async function getLatestGovernanceOutcomeReport(input: { projectId: string; orchestratorRunId?: string | null }) {
  const admin = createAdminClient()
  let query = admin.schema('governance').from('governance_outcome_reports')
    .select('id,orchestrator_run_id,report_hash,report_payload,created_at')
    .eq('project_id', input.projectId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (input.orchestratorRunId) query = query.eq('orchestrator_run_id', input.orchestratorRunId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Unable to load governance outcome report: ${error.message}`)
  if (!data) return null
  return {
    id: String(data.id),
    orchestratorRunId: String(data.orchestrator_run_id),
    reportHash: String(data.report_hash),
    createdAt: String(data.created_at),
    report: data.report_payload as GovernanceOutcomeReport,
  }
}

function findingFromCapability(row: Record<string, unknown>): GovernanceRiskFinding | null {
  const execution = String(row.execution_state ?? 'NOT_RUN')
  const verification = String(row.verification_state ?? 'UNKNOWN')
  const srNo = Number(row.capability_sr_no)
  const capability = String(row.capability ?? `Capability ${Number.isFinite(srNo) ? srNo : ''}`).trim()
  const moduleName = String(row.module ?? 'Governance capability').trim()
  const blocker = row.blocker_code ? String(row.blocker_code) : null

  if (execution === 'EXECUTED' && verification === 'VERIFIED') return null
  const status: GovernanceRiskFinding['status'] = execution === 'BLOCKED' ? 'BLOCKED' : 'UNRESOLVED'
  const severity: GovernanceRiskFinding['severity'] = execution === 'FAILED' || verification === 'FAILED'
    ? 'HIGH'
    : verification === 'INCONCLUSIVE'
      ? 'MEDIUM'
      : 'MEDIUM'
  const id = `capability-${Number.isFinite(srNo) ? srNo : createHash('sha256').update(`${moduleName}:${capability}`).digest('hex').slice(0, 12)}`
  const evidenceRefs = [{ type: 'AI_CAPABILITY_RESULT', id }]
  return {
    id,
    title: `${moduleName}: ${capability}`,
    severity,
    priorityRank: Number.isFinite(srNo) && srNo > 0 ? srNo : Number.MAX_SAFE_INTEGER,
    status,
    evidenceRefs,
    businessMeaning: blocker
      ? `The capability has not reached verified completion. Persisted blocker: ${blocker}.`
      : `The capability has not reached verified completion (${execution}/${verification}).`,
  }
}

/**
 * Builds the canonical report only from persisted run, capability-ledger, agent-run,
 * and recovery evidence. Unsupported score/value claims intentionally remain
 * NOT_MEASURED instead of being inferred from execution coverage.
 */
export async function assembleAndPersistGovernanceOutcomeReport(input: {
  projectId: string
  orchestratorRunId: string
}): Promise<GovernanceOutcomeReport | null> {
  const admin = createAdminClient()
  const { data: run, error: runError } = await admin.schema('governance').from('governance_orchestrator_runs')
    .select('id,project_id,status,ai_capability_e2e_run_id,supervisor_run_id,reporting_opt_in,report_persona,report_depth')
    .eq('id', input.orchestratorRunId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (runError) throw new Error(`Unable to load orchestrator run for reporting: ${runError.message}`)
  if (!run) throw new Error('Governance orchestrator run was not found for reporting.')
  if (run.reporting_opt_in !== true) return null

  const capabilityRunId = run.ai_capability_e2e_run_id ? String(run.ai_capability_e2e_run_id) : null
  const supervisorRunId = run.supervisor_run_id ? String(run.supervisor_run_id) : null
  const persona = normalizeReportingPreference({ enabled: true, persona: String(run.report_persona ?? '') as ReportPersona, depth: String(run.report_depth ?? '') as ReportDepth })

  const [capabilityResponse, childRunResponse, recoveryResponse] = await Promise.all([
    capabilityRunId
      ? admin.schema('governance').from('ai_capability_e2e_results')
          .select('capability_sr_no,module,capability,execution_state,verification_state,blocker_code')
          .eq('run_id', capabilityRunId)
          .order('capability_sr_no')
      : Promise.resolve({ data: [], error: null }),
    supervisorRunId
      ? admin.schema('agent').from('agent_runs').select('id,status').eq('parent_run_id', supervisorRunId)
      : Promise.resolve({ data: [], error: null }),
    admin.schema('orchestration').from('governance_recovery_events')
      .select('id,disposition,debugger_outcome,original_step_reexecuted,original_exit_gate_passed')
      .eq('orchestrator_run_id', input.orchestratorRunId),
  ])

  if (capabilityResponse.error) throw new Error(`Unable to load capability evidence for report: ${capabilityResponse.error.message}`)
  if (childRunResponse.error) throw new Error(`Unable to load agent task evidence for report: ${childRunResponse.error.message}`)
  if (recoveryResponse.error) throw new Error(`Unable to load recovery evidence for report: ${recoveryResponse.error.message}`)

  const capabilityRows = (capabilityResponse.data ?? []) as Record<string, unknown>[]
  const childRuns = (childRunResponse.data ?? []) as Array<{ id: unknown; status: unknown }>
  const recoveryRows = (recoveryResponse.data ?? []) as Array<Record<string, unknown>>
  const findings = capabilityRows.map(findingFromCapability).filter((finding): finding is GovernanceRiskFinding => finding !== null)
  const verified = capabilityRows.filter(row => row.execution_state === 'EXECUTED' && row.verification_state === 'VERIFIED').length
  const certificationCoveragePct = capabilityRows.length ? Math.round((verified / capabilityRows.length) * 10000) / 100 : 0
  const certificationEligible = capabilityRows.length > 0 && verified === capabilityRows.length
  const humanInterventions = recoveryRows.filter(row => ['REQUIRES_APPROVAL','REQUIRES_ROLLBACK','SECURITY_ESCALATION'].includes(String(row.disposition))).length + (run.status === 'WAITING_APPROVAL' ? 1 : 0)
  const changesRevalidated = recoveryRows.filter(row => row.original_step_reexecuted === true && row.original_exit_gate_passed === true).length

  const evidenceRefs = [
    { type: 'GOVERNANCE_ORCHESTRATOR_RUN', id: input.orchestratorRunId },
    ...(capabilityRunId ? [{ type: 'AI_CAPABILITY_E2E_RUN', id: capabilityRunId }] : []),
    ...childRuns.map(row => ({ type: 'AGENT_RUN', id: String(row.id) })),
    ...recoveryRows.map(row => ({ type: 'GOVERNANCE_RECOVERY_EVENT', id: String(row.id) })),
  ]

  return persistGovernanceOutcomeReport({
    reportId: randomUUID(),
    projectId: input.projectId,
    orchestratorRunId: input.orchestratorRunId,
    capabilityRunId,
    persona: persona.persona,
    depth: persona.depth,
    scores: {},
    findings,
    businessImpact: [],
    autonomousActivity: {
      totalAgentTasks: childRuns.length,
      autonomousActions: 0,
      humanInterventions,
      changesRevalidated,
      unresolvedIssues: findings.length,
    },
    certificationEligible,
    certificationCoveragePct,
    evidenceRefs,
  })
}
