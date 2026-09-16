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

export function computeTransparentOverallScore(scores: ReportScore[]): ReportScore {
  const measured = scores.filter(score => score.status !== 'NOT_MEASURED' && score.value !== null && score.evidenceRefs.length > 0)
  if (!measured.length) {
    return { key: 'overall', label: 'Overall Score', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' }
  }
  const value = measured.reduce((sum, score) => sum + (score.value ?? 0), 0) / measured.length
  return {
    key: 'overall',
    label: 'Overall Score',
    status: measured.every(score => score.status === 'MEASURED') ? 'MEASURED' : 'MODEL_DERIVED',
    value: Math.round(value * 100) / 100,
    evidenceRefs: normalizeEvidenceRefs(measured.flatMap(score => score.evidenceRefs)),
    method: `ARITHMETIC_MEAN_OF_${measured.length}_MEASURED_DIMENSIONS`,
  }
}

function riskTone(overall: ReportScore) {
  if (overall.value === null) return 'Evidence is incomplete, so DataNexus is not assigning an overall governance posture.'
  if (overall.value < 40) return 'The evidence indicates a critical governance posture requiring immediate leadership attention.'
  if (overall.value < 60) return 'The evidence indicates material governance risk requiring urgent executive attention.'
  if (overall.value < 75) return 'The evidence indicates material risks and clear near-term governance priorities.'
  if (overall.value < 90) return 'The evidence indicates a generally controlled posture with remaining governance priorities.'
  return 'The evidence indicates a strong governance posture; focus should remain on sustaining controls and resolving any remaining exceptions.'
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
  const scoreKeys: ScoreDimensionKey[] = ['governanceHealth', 'businessImpact', 'riskReduction', 'compliancePosture', 'dataQualityImprovement']
  const normalizedScores = Object.fromEntries(scoreKeys.map(key => [key, normalizeScore(key, input.scores[key])])) as Record<ScoreDimensionKey, ReportScore>
  const overall = computeTransparentOverallScore(scoreKeys.map(key => normalizedScores[key]))
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
    openingSummary: `${personaOpening(input.persona, overall, mostImportantRisk, unresolvedIssues)} ${riskTone(overall)}`,
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
