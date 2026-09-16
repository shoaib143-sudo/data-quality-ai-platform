import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildGovernanceOutcomeReport,
  type GovernanceOutcomeReport,
  type GovernanceOutcomeReportInput,
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
