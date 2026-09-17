type EvidenceRow = Record<string, any>

type InvestigatorEvidenceContext = {
  datasets: EvidenceRow[]
  versions: EvidenceRow[]
  profileRuns: EvidenceRow[]
  incidents: EvidenceRow[]
  issues: EvidenceRow[]
  remediationKnowledge: EvidenceRow[]
  alerts: EvidenceRow[]
  ruleRuns: EvidenceRow[]
  anomalies: EvidenceRow[]
  lineageAssets: EvidenceRow[]
  lineageColumnMappings: EvidenceRow[]
}

export type InvestigatorEvidenceStrength = 'LOW' | 'MEDIUM' | 'HIGH'

export type InvestigatorHypothesis = {
  datasetId: string
  hypothesisKey: 'FRESHNESS' | 'QUALITY_CONTROL' | 'PROFILE_DRIFT' | 'LINEAGE_CONTRIBUTION' | 'PROFILE_EXECUTION'
  hypothesis: string
  evidence: string[]
  evidenceFamilies: string[]
  evidenceStrength: InvestigatorEvidenceStrength
  confidence: null
  confidenceBasis: string
  discriminatingEvidenceNeeded: string[]
}

export type InvestigatorDatasetEvidence = {
  datasetId: string
  datasetName: string | null
  incidentIds: string[]
  issueIds: string[]
  freshnessAlertIds: string[]
  failedRuleIds: string[]
  anomalyIds: string[]
  failedOrPartialProfileRunIds: string[]
  lineageMappingIds: string[]
  workedRemediationIds: string[]
  failedRemediationIds: string[]
}

export type InvestigatorEvidenceAnalysis = {
  datasets: InvestigatorDatasetEvidence[]
  hypotheses: InvestigatorHypothesis[]
  recommendations: Array<{
    datasetId: string
    priority: 'MEDIUM'
    action: unknown
    evidence: string[]
    priorOutcome: 'WORKED'
    confidence: unknown
  }>
  unresolved: Array<{
    datasetId: string
    reason: string
    evidence: string[]
  }>
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function id(value: unknown) {
  const valueText = text(value)
  return valueText || null
}

function upper(value: unknown) {
  return text(value).toUpperCase()
}

function isOpen(status: unknown) {
  return !['RESOLVED', 'CLOSED', 'DONE', 'CANCELLED', 'REJECTED'].includes(upper(status))
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function evidenceStrength(input: {
  hasDirectIncident: boolean
  signalFamilies: number
}): InvestigatorEvidenceStrength {
  if (input.hasDirectIncident && input.signalFamilies >= 2) return 'HIGH'
  if (input.hasDirectIncident || input.signalFamilies >= 2) return 'MEDIUM'
  return 'LOW'
}

const CONFIDENCE_BASIS = 'No calibrated probability is asserted. Evidence strength is deterministic from same-dataset linkage, direct incident anchoring, and independent evidence families.'

export function buildInvestigatorEvidenceAnalysis(ctx: InvestigatorEvidenceContext): InvestigatorEvidenceAnalysis {
  const datasetNames = new Map(ctx.datasets.map((row) => [String(row.id), text(row.name) || null]))
  const versionToDataset = new Map(
    ctx.versions
      .map((row) => [id(row.id), id(row.dataset_id)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  )
  const runToDataset = new Map<string, string>()
  for (const row of ctx.profileRuns) {
    const runId = id(row.id)
    const datasetId = id(row.dataset_id) ?? (id(row.dataset_version_id) ? versionToDataset.get(String(row.dataset_version_id)) ?? null : null)
    if (runId && datasetId) runToDataset.set(runId, datasetId)
  }
  const lineageAssetToDataset = new Map(
    ctx.lineageAssets
      .map((row) => [id(row.id), id(row.dataset_id)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  )

  const datasetFor = (row: EvidenceRow) => {
    const direct = id(row.dataset_id)
    if (direct) return direct
    const profileRunId = id(row.profile_run_id)
    if (profileRunId) return runToDataset.get(profileRunId) ?? null
    return null
  }

  const bucket = new Map<string, {
    incidents: EvidenceRow[]
    issues: EvidenceRow[]
    freshnessAlerts: EvidenceRow[]
    failedRules: EvidenceRow[]
    anomalies: EvidenceRow[]
    failedOrPartialProfiles: EvidenceRow[]
    lineageMappings: EvidenceRow[]
    workedRemediation: EvidenceRow[]
    failedRemediation: EvidenceRow[]
  }>()

  const ensure = (datasetId: string) => {
    const current = bucket.get(datasetId)
    if (current) return current
    const created = {
      incidents: [],
      issues: [],
      freshnessAlerts: [],
      failedRules: [],
      anomalies: [],
      failedOrPartialProfiles: [],
      lineageMappings: [],
      workedRemediation: [],
      failedRemediation: [],
    }
    bucket.set(datasetId, created)
    return created
  }

  for (const row of ctx.incidents) {
    const datasetId = datasetFor(row)
    if (datasetId && isOpen(row.status)) ensure(datasetId).incidents.push(row)
  }
  for (const row of ctx.issues) {
    const datasetId = datasetFor(row)
    if (datasetId && isOpen(row.status)) ensure(datasetId).issues.push(row)
  }
  for (const row of ctx.alerts) {
    const datasetId = datasetFor(row)
    if (datasetId && isOpen(row.status) && upper(row.category) === 'FRESHNESS') ensure(datasetId).freshnessAlerts.push(row)
  }
  for (const row of ctx.ruleRuns) {
    const datasetId = datasetFor(row)
    if (datasetId && upper(row.status) === 'FAILED') ensure(datasetId).failedRules.push(row)
  }
  for (const row of ctx.anomalies) {
    const datasetId = datasetFor(row)
    if (datasetId) ensure(datasetId).anomalies.push(row)
  }
  for (const row of ctx.profileRuns) {
    const datasetId = datasetFor(row)
    if (datasetId && ['FAILED', 'PARTIAL'].includes(upper(row.status))) ensure(datasetId).failedOrPartialProfiles.push(row)
  }
  for (const row of ctx.remediationKnowledge) {
    const datasetId = datasetFor(row)
    if (!datasetId) continue
    if (upper(row.outcome_status) === 'WORKED') ensure(datasetId).workedRemediation.push(row)
    if (upper(row.outcome_status) === 'FAILED') ensure(datasetId).failedRemediation.push(row)
  }
  for (const row of ctx.lineageColumnMappings) {
    const sourceDataset = id(row.source_asset_id) ? lineageAssetToDataset.get(String(row.source_asset_id)) ?? null : null
    const targetDataset = id(row.target_asset_id) ? lineageAssetToDataset.get(String(row.target_asset_id)) ?? null : null
    for (const datasetId of unique([sourceDataset, targetDataset])) ensure(datasetId).lineageMappings.push(row)
  }

  const datasets: InvestigatorDatasetEvidence[] = []
  const hypotheses: InvestigatorHypothesis[] = []
  const recommendations: InvestigatorEvidenceAnalysis['recommendations'] = []
  const unresolved: InvestigatorEvidenceAnalysis['unresolved'] = []

  for (const [datasetId, evidence] of bucket.entries()) {
    const incidentIds = unique(evidence.incidents.map((row) => id(row.id)))
    const issueIds = unique(evidence.issues.map((row) => id(row.id)))
    const freshnessAlertIds = unique(evidence.freshnessAlerts.map((row) => id(row.id)))
    const failedRuleIds = unique(evidence.failedRules.map((row) => id(row.id)))
    const anomalyIds = unique(evidence.anomalies.map((row) => id(row.id)))
    const failedOrPartialProfileRunIds = unique(evidence.failedOrPartialProfiles.map((row) => id(row.id)))
    const lineageMappingIds = unique(evidence.lineageMappings.map((row) => id(row.id)))
    const workedRemediationIds = unique(evidence.workedRemediation.map((row) => id(row.id)))
    const failedRemediationIds = unique(evidence.failedRemediation.map((row) => id(row.id)))

    datasets.push({
      datasetId,
      datasetName: datasetNames.get(datasetId) ?? null,
      incidentIds,
      issueIds,
      freshnessAlertIds,
      failedRuleIds,
      anomalyIds,
      failedOrPartialProfileRunIds,
      lineageMappingIds,
      workedRemediationIds,
      failedRemediationIds,
    })

    const hasDirectIncident = incidentIds.length > 0
    const signalFamilies = [freshnessAlertIds, failedRuleIds, anomalyIds, failedOrPartialProfileRunIds].filter((values) => values.length > 0).length
    const strength = evidenceStrength({ hasDirectIncident, signalFamilies })
    const anchorEvidence = unique([...incidentIds, ...issueIds])

    if (freshnessAlertIds.length) {
      hypotheses.push({
        datasetId,
        hypothesisKey: 'FRESHNESS',
        hypothesis: 'A same-dataset freshness or SLA breach may be contributing to the observed quality or incident condition.',
        evidence: unique([...anchorEvidence, ...freshnessAlertIds]),
        evidenceFamilies: unique([hasDirectIncident ? 'incident' : null, issueIds.length ? 'issue' : null, 'freshness_alert']),
        evidenceStrength: strength,
        confidence: null,
        confidenceBasis: CONFIDENCE_BASIS,
        discriminatingEvidenceNeeded: [
          'Compare profile and arrival timestamps immediately before and after the freshness breach.',
          'Confirm whether downstream symptoms begin after the same-dataset freshness event.',
        ],
      })
    }

    if (failedRuleIds.length) {
      hypotheses.push({
        datasetId,
        hypothesisKey: 'QUALITY_CONTROL',
        hypothesis: 'One or more governed quality controls are violated on the same dataset as the investigated condition.',
        evidence: unique([...anchorEvidence, ...failedRuleIds]),
        evidenceFamilies: unique([hasDirectIncident ? 'incident' : null, issueIds.length ? 'issue' : null, 'quality_rule_failure']),
        evidenceStrength: strength,
        confidence: null,
        confidenceBasis: CONFIDENCE_BASIS,
        discriminatingEvidenceNeeded: [
          'Compare the failed rule metric with the previous passing run for the same dataset.',
          'Verify whether the rule failure precedes or coincides with the incident window.',
        ],
      })
    }

    if (anomalyIds.length) {
      hypotheses.push({
        datasetId,
        hypothesisKey: 'PROFILE_DRIFT',
        hypothesis: 'Same-dataset profile metric drift may explain a change in observed data behavior.',
        evidence: unique([...anchorEvidence, ...anomalyIds]),
        evidenceFamilies: unique([hasDirectIncident ? 'incident' : null, issueIds.length ? 'issue' : null, 'profile_anomaly']),
        evidenceStrength: strength,
        confidence: null,
        confidenceBasis: CONFIDENCE_BASIS,
        discriminatingEvidenceNeeded: [
          'Inspect the persisted baseline and current metric values for the anomalous field or dataset metric.',
          'Check whether the drift is present in the last known healthy run for the same dataset.',
        ],
      })
    }

    if (failedOrPartialProfileRunIds.length) {
      hypotheses.push({
        datasetId,
        hypothesisKey: 'PROFILE_EXECUTION',
        hypothesis: 'A failed or partial profiling execution may limit the completeness of the evidence used to diagnose this dataset.',
        evidence: unique([...anchorEvidence, ...failedOrPartialProfileRunIds]),
        evidenceFamilies: unique([hasDirectIncident ? 'incident' : null, 'profile_execution']),
        evidenceStrength: strength,
        confidence: null,
        confidenceBasis: CONFIDENCE_BASIS,
        discriminatingEvidenceNeeded: [
          'Inspect persisted profile error codes and missing metric coverage for the failed or partial run.',
          'Compare against the latest complete profile for the same dataset before drawing a root-cause conclusion.',
        ],
      })
    }

    if (lineageMappingIds.length && signalFamilies > 0) {
      hypotheses.push({
        datasetId,
        hypothesisKey: 'LINEAGE_CONTRIBUTION',
        hypothesis: 'A mapped upstream or downstream transformation may contribute to the same-dataset signal; attribution requires transformation-level evidence.',
        evidence: unique([...anchorEvidence, ...lineageMappingIds]),
        evidenceFamilies: unique([hasDirectIncident ? 'incident' : null, 'field_lineage']),
        evidenceStrength: strength,
        confidence: null,
        confidenceBasis: CONFIDENCE_BASIS,
        discriminatingEvidenceNeeded: [
          'Inspect the persisted transformation expression or operation for the mapped fields.',
          'Compare upstream and downstream profile evidence across the same incident window.',
        ],
      })
    }

    for (const row of evidence.workedRemediation) {
      const rowId = id(row.id)
      if (!rowId) continue
      recommendations.push({
        datasetId,
        priority: 'MEDIUM',
        action: row.reusable_guidance || row.remediation_action,
        evidence: [rowId],
        priorOutcome: 'WORKED',
        confidence: row.confidence ?? null,
      })
    }

    if (hasDirectIncident && signalFamilies === 0) {
      unresolved.push({
        datasetId,
        reason: 'An open incident is present but no same-dataset freshness, failed-rule, anomaly, or incomplete-profile signal is available in the bounded evidence window.',
        evidence: incidentIds,
      })
    }
  }

  datasets.sort((a, b) => a.datasetId.localeCompare(b.datasetId))
  hypotheses.sort((a, b) => `${a.datasetId}:${a.hypothesisKey}`.localeCompare(`${b.datasetId}:${b.hypothesisKey}`))
  recommendations.sort((a, b) => a.datasetId.localeCompare(b.datasetId))
  unresolved.sort((a, b) => a.datasetId.localeCompare(b.datasetId))

  return { datasets, hypotheses, recommendations, unresolved }
}
