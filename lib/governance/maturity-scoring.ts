import {
  GOVERNANCE_MATURITY_QUESTIONS,
  MATURITY_DOMAINS,
  questionApplies,
  type AssessmentPriority,
  type MaturityCriticality,
  type OrganizationAssessmentProfile,
} from './maturity-framework'

export type AssessmentAnswer = {
  questionId: string
  respondentId?: string
  maturity: number | null
  target?: number | null
  priority?: AssessmentPriority | null
  evidenceConfidence?: number | null
  coverage?: number | null
  comment?: string | null
}

export type QuestionScore = {
  questionId: string
  domainId: string
  maturity: number
  target: number
  maturityScore: number
  gap: number
  consensus: number | null
  evidenceConfidence: number | null
  coverage: number | null
  respondents: number
  criticality: MaturityCriticality
  priority: AssessmentPriority
  weightedContribution: number
  weight: number
}

export type MaturityScorecard = {
  maturity: number
  targetMaturity: number
  evidenceConfidence: number | null
  controlCoverage: number | null
  assessmentConsensus: number | null
  riskExposure: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  completion: number
  respondentCount: number
  roadmap: Array<{
    questionId: string
    label: string
    maturity: number
    target: number
    gap: number
    criticality: MaturityCriticality
    priority: AssessmentPriority
    priorityScore: number
    recommendedAction: string
    dataNexusAction: string
  }>
  criticalGaps: Array<{
    questionId: string
    label: string
    maturity: number
    target: number
    gap: number
    recommendedAction: string
    dataNexusAction: string
  }>
  domains: Array<{
    id: string
    label: string
    maturity: number | null
    target: number | null
    answered: number
    applicable: number
  }>
  questions: QuestionScore[]
}

const criticalityFactor: Record<MaturityCriticality, number> = {
  CRITICAL: 2.0,
  HIGH: 1.45,
  STANDARD: 1.0,
  CONTEXTUAL: 0.7,
}
const priorityFactor: Record<AssessmentPriority, number> = { HIGH: 1.4, MEDIUM: 1.0, LOW: 0.7 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
function round(value: number, digits = 1) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
function normalizedPercent(level: number) {
  return clamp(level, 0, 5) * 20
}
function questionConsensus(levels: number[]) {
  if (levels.length < 2) return null
  const range = Math.max(...levels) - Math.min(...levels)
  return round(clamp(100 - (range / 5) * 100, 0, 100))
}

export function scoreGovernanceMaturity(
  profile: OrganizationAssessmentProfile,
  answers: readonly AssessmentAnswer[],
): MaturityScorecard {
  const applicableQuestions = GOVERNANCE_MATURITY_QUESTIONS.filter(question => questionApplies(question, profile))
  const answersByQuestion = new Map<string, AssessmentAnswer[]>()
  for (const answer of answers) {
    if (!applicableQuestions.some(question => question.id === answer.questionId)) continue
    const maturity = answer.maturity
    if (maturity === null || !Number.isFinite(maturity) || maturity < 0 || maturity > 5) continue
    const current = answersByQuestion.get(answer.questionId) ?? []
    current.push(answer)
    answersByQuestion.set(answer.questionId, current)
  }

  const domainWeight = new Map(MATURITY_DOMAINS.map(domain => [domain.id, domain.weight]))
  const questionScores: QuestionScore[] = []
  let weightedMaturity = 0
  let weightedTarget = 0
  let totalWeight = 0
  let riskPoints = 0
  const evidenceValues: number[] = []
  const coverageValues: number[] = []
  const consensusValues: number[] = []
  const respondentIds = new Set<string>()

  for (const question of applicableQuestions) {
    const questionAnswers = answersByQuestion.get(question.id) ?? []
    if (!questionAnswers.length) continue

    const levels = questionAnswers.map(answer => clamp(Number(answer.maturity), 0, 5))
    const maturity = mean(levels) ?? 0
    const targets = questionAnswers
      .map(answer => answer.target)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => clamp(value, 0, 5))
    const target = targets.length ? mean(targets)! : question.defaultTarget
    const priorities = questionAnswers.map(answer => answer.priority).filter(Boolean) as AssessmentPriority[]
    const priority: AssessmentPriority = priorities.includes('HIGH') ? 'HIGH' : priorities.includes('MEDIUM') ? 'MEDIUM' : 'LOW'
    const evidence = questionAnswers
      .map(answer => answer.evidenceConfidence)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => clamp(value, 0, 100))
    const coverage = questionAnswers
      .map(answer => answer.coverage)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => clamp(value, 0, 100))
    const consensus = questionConsensus(levels)
    const questionEvidence = mean(evidence)
    const questionCoverage = mean(coverage)
    if (questionEvidence !== null) evidenceValues.push(questionEvidence)
    if (questionCoverage !== null) coverageValues.push(questionCoverage)
    if (consensus !== null) consensusValues.push(consensus)
    for (const answer of questionAnswers) if (answer.respondentId) respondentIds.add(answer.respondentId)

    const weight = question.weight * (domainWeight.get(question.domainId) ?? 1)
    const maturityScore = normalizedPercent(maturity)
    const targetScore = normalizedPercent(target)
    const gap = Math.max(0, target - maturity)
    weightedMaturity += maturityScore * weight
    weightedTarget += targetScore * weight
    totalWeight += weight
    riskPoints += gap * criticalityFactor[question.criticality] * priorityFactor[priority] * weight

    questionScores.push({
      questionId: question.id,
      domainId: question.domainId,
      maturity: round(maturity, 2),
      target: round(target, 2),
      maturityScore: round(maturityScore),
      gap: round(gap, 2),
      consensus,
      evidenceConfidence: questionEvidence === null ? null : round(questionEvidence),
      coverage: questionCoverage === null ? null : round(questionCoverage),
      respondents: questionAnswers.length,
      criticality: question.criticality,
      priority,
      weightedContribution: round(maturityScore * weight, 2),
      weight: round(weight, 2),
    })
  }

  const maturity = totalWeight ? round(weightedMaturity / totalWeight) : 0
  const targetMaturity = totalWeight ? round(weightedTarget / totalWeight) : 0
  const completion = applicableQuestions.length ? round((questionScores.length / applicableQuestions.length) * 100) : 0
  const maxRisk = applicableQuestions.reduce((sum, question) => {
    const weight = question.weight * (domainWeight.get(question.domainId) ?? 1)
    return sum + 5 * criticalityFactor[question.criticality] * 1.4 * weight
  }, 0)
  const normalizedRisk = maxRisk ? (riskPoints / maxRisk) * 100 : 0
  const riskExposure = normalizedRisk >= 34 ? 'CRITICAL' : normalizedRisk >= 20 ? 'HIGH' : normalizedRisk >= 9 ? 'MODERATE' : 'LOW'

  const questionScoreMap = new Map(questionScores.map(score => [score.questionId, score]))
  const roadmap = applicableQuestions.flatMap(question => {
    const score = questionScoreMap.get(question.id)
    if (!score || score.gap < 0.5) return []
    const priorityScore = score.gap
      * criticalityFactor[question.criticality]
      * priorityFactor[score.priority]
      * score.weight
    return [{
      questionId: question.id,
      label: question.shortLabel,
      maturity: score.maturity,
      target: score.target,
      gap: score.gap,
      criticality: question.criticality,
      priority: score.priority,
      priorityScore: round(priorityScore, 2),
      recommendedAction: question.recommendedAction,
      dataNexusAction: question.dataNexusAction,
    }]
  }).sort((a, b) => b.priorityScore - a.priorityScore)

  const criticalGaps = applicableQuestions.flatMap(question => {
    const score = questionScoreMap.get(question.id)
    if (!score || question.criticality !== 'CRITICAL' || score.gap < 1 || score.maturity >= 3) return []
    return [{
      questionId: question.id,
      label: question.shortLabel,
      maturity: score.maturity,
      target: score.target,
      gap: score.gap,
      recommendedAction: question.recommendedAction,
      dataNexusAction: question.dataNexusAction,
    }]
  }).sort((a, b) => b.gap - a.gap)

  const domains = MATURITY_DOMAINS.map(domain => {
    const applicable = applicableQuestions.filter(question => question.domainId === domain.id)
    const scored = applicable.map(question => questionScoreMap.get(question.id)).filter(Boolean) as QuestionScore[]
    const weightSum = scored.reduce((sum, score) => sum + score.weight, 0)
    return {
      id: domain.id,
      label: domain.label,
      maturity: weightSum ? round(scored.reduce((sum, score) => sum + score.maturityScore * score.weight, 0) / weightSum) : null,
      target: weightSum ? round(scored.reduce((sum, score) => sum + normalizedPercent(score.target) * score.weight, 0) / weightSum) : null,
      answered: scored.length,
      applicable: applicable.length,
    }
  })

  return {
    maturity,
    targetMaturity,
    evidenceConfidence: evidenceValues.length ? round(mean(evidenceValues)!) : null,
    controlCoverage: coverageValues.length ? round(mean(coverageValues)!) : null,
    assessmentConsensus: consensusValues.length ? round(mean(consensusValues)!) : null,
    riskExposure,
    completion,
    respondentCount: respondentIds.size || (questionScores.length ? 1 : 0),
    roadmap,
    criticalGaps,
    domains,
    questions: questionScores,
  }
}
