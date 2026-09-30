import { authorizeProject } from '@/lib/auth/authorize'
import { GOVERNED_AGENT_KEYS } from '@/lib/agents/governed-agent-registry'
import { createAdminClient } from '@/lib/supabase/admin'

export type ProspectiveLearningSummary = {
  agentKey: string
  agentVersion: string
  runMode: string
  sampleCount: number
  effectiveCount: number
  ineffectiveCount: number
  partialCount: number
  otherCount: number
  meanEffectiveness: number | null
  firstVerifiedAt: string
  lastVerifiedAt: string
}

export type ProspectiveLearningAgentCoverage = {
  agentKey: string
  sampleCount: number
  effectiveCount: number
  ineffectiveCount: number
  partialCount: number
  otherCount: number
  measuredModes: string[]
  lastVerifiedAt: string | null
}

export type ProspectiveLearningCommandCenterState = {
  summaries: ProspectiveLearningSummary[]
  agentCoverage: ProspectiveLearningAgentCoverage[]
  counts: {
    observedOutcomes: number
    agentsWithEvidence: number
    measuredModes: number
    effective: number
    ineffective: number
    partial: number
    other: number
  }
  authority: {
    readOnly: true
    selfPromotionAllowed: false
    automaticAuthorityExpansionAllowed: false
  }
}

type SummaryRow = {
  agent_key: unknown
  agent_version: unknown
  run_mode: unknown
  sample_count: unknown
  effective_count: unknown
  ineffective_count: unknown
  partial_count: unknown
  other_count: unknown
  mean_effectiveness: unknown
  first_verified_at: unknown
  last_verified_at: unknown
}

function finiteCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function optionalNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeSummary(row: SummaryRow): ProspectiveLearningSummary {
  return {
    agentKey: String(row.agent_key),
    agentVersion: String(row.agent_version),
    runMode: String(row.run_mode),
    sampleCount: finiteCount(row.sample_count),
    effectiveCount: finiteCount(row.effective_count),
    ineffectiveCount: finiteCount(row.ineffective_count),
    partialCount: finiteCount(row.partial_count),
    otherCount: finiteCount(row.other_count),
    meanEffectiveness: optionalNumber(row.mean_effectiveness),
    firstVerifiedAt: String(row.first_verified_at),
    lastVerifiedAt: String(row.last_verified_at),
  }
}

/**
 * Read-only Command Center projection for verified production outcomes.
 * Missing agents and modes are deliberately represented as zero evidence,
 * never as successful or failed results.
 */
export async function readProspectiveLearningCommandCenterState(
  projectId: string,
  actorUserId: string,
): Promise<ProspectiveLearningCommandCenterState> {
  await authorizeProject(actorUserId, projectId, 'admin.manage')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('summarize_learning_prospective_outcomes', {
    p_project_id: projectId,
  })
  if (error) throw new Error(`Unable to load prospective learning outcomes: ${error.message}`)

  const summaries = ((data ?? []) as SummaryRow[]).map(normalizeSummary)
  const coverageByAgent = new Map<string, ProspectiveLearningAgentCoverage>()
  for (const agentKey of GOVERNED_AGENT_KEYS) {
    coverageByAgent.set(agentKey, {
      agentKey,
      sampleCount: 0,
      effectiveCount: 0,
      ineffectiveCount: 0,
      partialCount: 0,
      otherCount: 0,
      measuredModes: [],
      lastVerifiedAt: null,
    })
  }
  for (const summary of summaries) {
    const current = coverageByAgent.get(summary.agentKey) ?? {
      agentKey: summary.agentKey,
      sampleCount: 0,
      effectiveCount: 0,
      ineffectiveCount: 0,
      partialCount: 0,
      otherCount: 0,
      measuredModes: [],
      lastVerifiedAt: null,
    }
    current.sampleCount += summary.sampleCount
    current.effectiveCount += summary.effectiveCount
    current.ineffectiveCount += summary.ineffectiveCount
    current.partialCount += summary.partialCount
    current.otherCount += summary.otherCount
    if (!current.measuredModes.includes(summary.runMode)) current.measuredModes.push(summary.runMode)
    if (!current.lastVerifiedAt || summary.lastVerifiedAt > current.lastVerifiedAt) current.lastVerifiedAt = summary.lastVerifiedAt
    coverageByAgent.set(summary.agentKey, current)
  }
  const agentCoverage = [...coverageByAgent.values()]
  const measuredModes = new Set(summaries.map((summary) => summary.runMode))
  return {
    summaries,
    agentCoverage,
    counts: {
      observedOutcomes: summaries.reduce((sum, row) => sum + row.sampleCount, 0),
      agentsWithEvidence: agentCoverage.filter((row) => row.sampleCount > 0).length,
      measuredModes: measuredModes.size,
      effective: summaries.reduce((sum, row) => sum + row.effectiveCount, 0),
      ineffective: summaries.reduce((sum, row) => sum + row.ineffectiveCount, 0),
      partial: summaries.reduce((sum, row) => sum + row.partialCount, 0),
      other: summaries.reduce((sum, row) => sum + row.otherCount, 0),
    },
    authority: {
      readOnly: true,
      selfPromotionAllowed: false,
      automaticAuthorityExpansionAllowed: false,
    },
  }
}
