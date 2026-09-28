import type { SkillBenchmarkEvidence } from './governed-skill-promotion-gate'

export type PairedLearningCase = {
  caseKey: string
  baselineScore: number
  candidateScore: number
  baselineEvidenceRef: string
  candidateEvidenceRef: string
  authorityViolation: boolean
  adversarialFailure: boolean
}

/** Validate that aggregate benchmark claims are backed by the same held-out cases. */
export function validatePairedLearningBenchmark(input: {
  benchmark: SkillBenchmarkEvidence
  cases: readonly PairedLearningCase[]
  trainingCaseKeys: readonly string[]
}) {
  const { benchmark, cases } = input
  if (!cases.length || cases.length !== benchmark.caseCount) {
    throw new Error('paired benchmark case count does not match aggregate caseCount')
  }
  const trainingKeys = new Set(input.trainingCaseKeys.map((key) => key.trim()))
  const caseKeys = new Set<string>()
  const refs = new Set<string>()
  let baselineTotal = 0
  let candidateTotal = 0
  let authorityViolations = 0
  let adversarialFailures = 0
  for (const item of cases) {
    const key = item.caseKey.trim()
    if (!key || caseKeys.has(key)) throw new Error('paired benchmark case keys must be nonempty and unique')
    if (trainingKeys.has(key)) throw new Error('paired benchmark held-out case overlaps candidate training evidence')
    caseKeys.add(key)
    if (!Number.isFinite(item.baselineScore) || item.baselineScore < 0 || item.baselineScore > 1
      || !Number.isFinite(item.candidateScore) || item.candidateScore < 0 || item.candidateScore > 1) {
      throw new Error('paired benchmark scores must be between 0 and 1')
    }
    for (const ref of [item.baselineEvidenceRef, item.candidateEvidenceRef]) {
      if (!ref.trim() || refs.has(ref.trim())) throw new Error('paired benchmark evidence references must be nonempty and unique')
      refs.add(ref.trim())
    }
    baselineTotal += item.baselineScore
    candidateTotal += item.candidateScore
    authorityViolations += Number(item.authorityViolation)
    adversarialFailures += Number(item.adversarialFailure)
  }
  const tolerance = 0.000001
  if (Math.abs(baselineTotal / cases.length - benchmark.baselineScore) > tolerance
    || Math.abs(candidateTotal / cases.length - benchmark.candidateScore) > tolerance) {
    throw new Error('paired benchmark scores do not match aggregate scores')
  }
  if (authorityViolations !== benchmark.authorityViolations || adversarialFailures !== benchmark.adversarialFailures) {
    throw new Error('paired benchmark safety counts do not match aggregate counts')
  }
  if (refs.size !== benchmark.evidenceRefs.length
    || benchmark.evidenceRefs.some((ref) => !refs.has(ref))) {
    throw new Error('paired benchmark evidence references do not match aggregate evidence')
  }
  return { caseCount: cases.length, baselineScore: baselineTotal / cases.length, candidateScore: candidateTotal / cases.length }
}
