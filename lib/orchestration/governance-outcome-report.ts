export type EvidenceRef = {
  type: string
  id: string
  hash?: string | null
}

export type MeasurementStatus = 'MEASURED' | 'MODEL_DERIVED' | 'NOT_MEASURED'
export type ReportPersona = 'EXECUTIVE' | 'GOVERNANCE_COUNCIL' | 'DATA_STEWARD' | 'AUDIT'
export type ReportDepth = 'EXECUTIVE' | 'GOVERNANCE' | 'AUDIT'

export type ScoreDimensionKey =
  | 'governanceHealth'
  | 'businessImpact'
  | 'riskReduction'
  | 'compliancePosture'
  | 'dataQualityImprovement'

export type ReportScore = {
  key: ScoreDimensionKey | 'overall'
  label: string
  status: MeasurementStatus
  value: number | null
  evidenceRefs: EvidenceRef[]
  method: string
}

export type ScoreAggregationPolicy =
  | {
      method: 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS'
      policyId: string
    }
  | {
      method: 'GOVERNED_WEIGHTS'
      policyId: string
      weights: Partial<Record<ScoreDimensionKey, number>>
    }

export type NarrativePolicy = {
  policyId: string
  bands: Array<{ maxInclusive: number; statement: string }>
  aboveMaximumStatement: string
}

export type EvidenceBackedClaim = {
  id: string
  statement: string
  status: Exclude<MeasurementStatus, 'NOT_MEASURED'>
  evidenceRefs: EvidenceRef[]
  method?: string | null
  value?: number | null
  unit?: string | null
}

export type GovernanceRiskFinding = {
  id: string
  title: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  priorityRank: number
  status: 'RESOLVED' | 'UNRESOLVED' | 'BLOCKED' | 'NOT_MEASURED'
  evidenceRefs: EvidenceRef[]
  businessMeaning?: string | null
}

export type AutonomousActivitySummary = {
  totalAgentTasks: number
  autonomousActions: number
  humanInterventions: number
  changesRevalidated: number
  unresolvedIssues: number
}

export type GovernanceOutcomeReport = {
  schemaVersion: '1.0'
  reportId: string
  reportHashInput: string
  projectId: string
  orchestratorRunId: string
  capabilityRunId: string | null
  generatedAt: string
  persona: ReportPersona
  depth: ReportDepth
  title: string
  openingSummary: string
  scores: Record<ScoreDimensionKey, ReportScore> & { overall: ReportScore }
  mostImportantRisk: GovernanceRiskFinding | null
  businessImpact: EvidenceBackedClaim[]
  findings: GovernanceRiskFinding[]
  autonomousActivity: AutonomousActivitySummary
  unresolvedStatement: string
  assuranceStatement: string
  evidenceRefs: EvidenceRef[]
}

export type GovernanceOutcomeReportInput = {
  reportId: string
  projectId: string
  orchestratorRunId: string
  capabilityRunId?: string | null
  generatedAt?: string
  persona: ReportPersona
  depth: ReportDepth
  scores: Partial<Record<ScoreDimensionKey, Omit<ReportScore, 'key' | 'label'>>>
  aggregationPolicy?: ScoreAggregationPolicy | null
  narrativePolicy?: NarrativePolicy | null
  findings: GovernanceRiskFinding[]
  businessImpact: EvidenceBackedClaim[]
  autonomousActivity: AutonomousActivitySummary
  certificationEligible: boolean
  certificationCoveragePct: number
  evidenceRefs: EvidenceRef[]
}

const SCORE_LABELS: Record<ScoreDimensionKey, string> = {
  governanceHealth: 'Governance Health',
  businessImpact: 'Business Impact',
  riskReduction: 'Risk Reduction',
  compliancePosture: 'Compliance Posture',
  dataQualityImprovement: 'Data Quality Improvement',
}

const SCORE_KEYS: ScoreDimensionKey[] = ['governanceHealth', 'businessImpact', 'riskReduction', 'compliancePosture', 'dataQualityImprovement']

function finiteScore(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function normalizeEvidenceRefs(refs: EvidenceRef[]) {
  const seen = new Set<string>()
  const normalized: EvidenceRef[] = []
  for (const ref of refs) {
    if (!ref?.type || !ref?.id) continue
    const key = `${ref.type}:${ref.id}:${ref.hash ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push({ type: String(ref.type), id: String(ref.id), hash: ref.hash ? String(ref.hash) : null })
  }
  return normalized
}

function normalizeScore(key: ScoreDimensionKey, input?: Omit<ReportScore, 'key' | 'label'>): ReportScore {
  if (!input) {
    return { key, label: SCORE_LABELS[key], status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' }
  }
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs ?? [])
  const value = finiteScore(input.value)
  const supported = value !== null && evidenceRefs.length > 0 && input.status !== 'NOT_MEASURED'
  return {
    key,
    label: SCORE_LABELS[key],
    status: supported ? input.status : 'NOT_MEASURED',
    value: supported ? value : null,
    evidenceRefs: supported ? evidenceRefs : [],
    method: supported && input.method ? input.method : 'NOT_MEASURED',
  }
}

function unmeasuredOverall(method: string): ReportScore {
  return { key: 'overall', label: 'Overall Score', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method }
}

export function computeTransparentOverallScore(scores: ReportScore[], policy?: ScoreAggregationPolicy | null): ReportScore {
  if (!policy?.policyId?.trim()) return unmeasuredOverall('GOVERNED_AGGREGATION_POLICY_REQUIRED')
  const measured = scores.filter(score => score.status !== 'NOT_MEASURED' && score.value !== null && score.evidenceRefs.length > 0)
  if (!measured.length) return unmeasuredOverall(`NO_MEASURED_DIMENSIONS:${policy.policyId}`)

  if (policy.method === 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS') {
    const value = measured.reduce((sum, score) => sum + (score.value ?? 0), 0) / measured.length
    return {
      key: 'overall',
      label: 'Overall Score',
      status: measured.every(score => score.status === 'MEASURED') ? 'MEASURED' : 'MODEL_DERIVED',
      value: Math.round(value * 100) / 100,
      evidenceRefs: normalizeEvidenceRefs(measured.flatMap(score => score.evidenceRefs)),
      method: `EQUAL_WEIGHT_EVIDENCED_DIMENSIONS:${policy.policyId}:${measured.length}`,
    }
  }

  const weightedDimensions = SCORE_KEYS.map(key => {
    const weight = Number(policy.weights[key] ?? 0)
    const score = scores.find(candidate => candidate.key === key)
    return { key, weight, score }
  }).filter(item => Number.isFinite(item.weight) && item.weight > 0)
  if (!weightedDimensions.length) return unmeasuredOverall(`INVALID_GOVERNED_WEIGHTS:${policy.policyId}`)
  if (weightedDimensions.some(item => !item.score || item.score.status === 'NOT_MEASURED' || item.score.value === null || !item.score.evidenceRefs.length)) {
    return unmeasuredOverall(`INCOMPLETE_GOVERNED_WEIGHT_INPUTS:${policy.policyId}`)
  }
  const weightTotal = weightedDimensions.reduce((sum, item) => sum + item.weight, 0)
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) return unmeasuredOverall(`INVALID_GOVERNED_WEIGHTS:${policy.policyId}`)
  const value = weightedDimensions.reduce((sum, item) => sum + (item.score!.value ?? 0) * item.weight, 0) / weightTotal
  const contributingScores = weightedDimensions.map(item => item.score!)
  return {
    key: 'overall',
    label: 'Overall Score',
    status: contributingScores.every(score => score.status === 'MEASURED') ? 'MEASURED' : 'MODEL_DERIVED',
    value: Math.round(value * 100) / 100,
    evidenceRefs: normalizeEvidenceRefs(contributingScores.flatMap(score => score.evidenceRefs)),
    method: `GOVERNED_WEIGHTS:${policy.policyId}`,
  }
}

function riskTone(overall: ReportScore, policy?: NarrativePolicy | null) {
  if (overall.value === null) return 'Evidence is incomplete, so DataNexus is not assigning an overall governance posture.'
  if (!policy?.policyId?.trim() || !Array.isArray(policy.bands) || !policy.aboveMaximumStatement?.trim()) {
    return 'Overall score is measured, but no governed narrative severity policy is configured; DataNexus is not assigning a severity label from the score.'
  }
  const bands = policy.bands
    .filter(band => Number.isFinite(band.maxInclusive) && band.maxInclusive >= 0 && band.maxInclusive <= 100 && band.statement?.trim())
    .sort((a, b) => a.maxInclusive - b.maxInclusive)
  for (const band of bands) if (overall.value <= band.maxInclusive) return band.statement.trim()
  return policy.aboveMaximumStatement.trim()
}

function selectMostImportantRisk(findings: GovernanceRiskFinding[]) {
  const eligible = findings.filter(finding => finding.status === 'UNRESOLVED' || finding.status === 'BLOCKED')
  if (!eligible.length) return null
  return [...eligible].sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank
    const severity = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    return severity[b.severity] - severity[a.severity]
  })[0] ?? null
}

function personaOpening(persona: ReportPersona, overall: ReportScore, mostImportantRisk: GovernanceRiskFinding | null, unresolved: number) {
  const scoreText = overall.value === null ? 'Overall governance score is not measured.' : `Overall governance score is ${overall.value.toFixed(2)} out of 100.`
  const riskText = mostImportantRisk ? ` The highest-priority evidenced risk is “${mostImportantRisk.title}”.` : ' No unresolved evidenced risk is currently ranked as the top priority.'
  const unresolvedText = ` ${unresolved} issue${unresolved === 1 ? '' : 's'} remain unresolved.`
  const prefix = persona === 'EXECUTIVE'
    ? 'Executive outcome:'
    : persona === 'GOVERNANCE_COUNCIL'
      ? 'Governance council outcome:'
      : persona === 'DATA_STEWARD'
        ? 'Stewardship outcome:'
        : 'Audit outcome:'
  return `${prefix} ${scoreText}${riskText}${unresolvedText}`
}

export function buildGovernanceOutcomeReport(input: GovernanceOutcomeReportInput): GovernanceOutcomeReport {
  const normalizedScores = Object.fromEntries(SCORE_KEYS.map(key => [key, normalizeScore(key, input.scores[key])])) as Record<ScoreDimensionKey, ReportScore>
  const overall = computeTransparentOverallScore(SCORE_KEYS.map(key => normalizedScores[key]), input.aggregationPolicy)
  const findings = input.findings.map(finding => ({ ...finding, evidenceRefs: normalizeEvidenceRefs(finding.evidenceRefs) }))
  const mostImportantRisk = selectMostImportantRisk(findings)
  const businessImpact = input.businessImpact
    .map(claim => ({ ...claim, evidenceRefs: normalizeEvidenceRefs(claim.evidenceRefs) }))
    .filter(claim => claim.evidenceRefs.length > 0 && (claim.status === 'MEASURED' || claim.status === 'MODEL_DERIVED'))
  const unresolvedIssues = findings.filter(finding => finding.status === 'UNRESOLVED' || finding.status === 'BLOCKED').length
  const autonomousActivity = { ...input.autonomousActivity, unresolvedIssues }
  const certificationCoverage = finiteScore(input.certificationCoveragePct)
  const assuranceStatement = input.certificationEligible
    ? `Independent certification is eligible with ${certificationCoverage ?? 0}% certification coverage.`
    : `Independent certification is not complete${certificationCoverage === null ? '' : `; current certification coverage is ${certificationCoverage}%`}.`
  const evidenceRefs = normalizeEvidenceRefs([
    ...input.evidenceRefs,
    ...Object.values(normalizedScores).flatMap(score => score.evidenceRefs),
    ...overall.evidenceRefs,
    ...findings.flatMap(finding => finding.evidenceRefs),
    ...businessImpact.flatMap(claim => claim.evidenceRefs),
  ])
  const reportHashInput = JSON.stringify({
    schemaVersion: '1.0', projectId: input.projectId, orchestratorRunId: input.orchestratorRunId,
    capabilityRunId: input.capabilityRunId ?? null, scores: { ...normalizedScores, overall }, findings, businessImpact,
    autonomousActivity, certificationEligible: input.certificationEligible, certificationCoveragePct: certificationCoverage,
    aggregationPolicy: input.aggregationPolicy ?? null,
    narrativePolicyId: input.narrativePolicy?.policyId ?? null,
    evidenceRefs,
  })
  return {
    schemaVersion: '1.0',
    reportId: input.reportId,
    reportHashInput,
    projectId: input.projectId,
    orchestratorRunId: input.orchestratorRunId,
    capabilityRunId: input.capabilityRunId ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    persona: input.persona,
    depth: input.depth,
    title: 'DataNexus Governance Outcome Report',
    openingSummary: `${personaOpening(input.persona, overall, mostImportantRisk, unresolvedIssues)} ${riskTone(overall, input.narrativePolicy)}`,
    scores: { ...normalizedScores, overall },
    mostImportantRisk,
    businessImpact,
    findings,
    autonomousActivity,
    unresolvedStatement: `${unresolvedIssues} issue${unresolvedIssues === 1 ? '' : 's'} remain unresolved.`,
    assuranceStatement,
    evidenceRefs,
  }
}
