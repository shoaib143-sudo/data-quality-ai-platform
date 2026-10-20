import type { PairedLearningCase } from './governed-learning-paired-benchmark'

const SHA256_CASE_KEY = /^[a-f0-9]{64}$/
const UUID_EVIDENCE_REF = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i

export type IndependentPairedEvaluationInput = {
  projectId: string
  candidateId: string
  agentKey: string
  skillKey: string
  evaluatorId: string
  evaluatorType: 'DETERMINISTIC' | 'LABELED_DATASET' | 'ADVERSARIAL_SUITE' | 'HUMAN_EVALUATION'
  benchmarkKey: string
  datasetKey: string
  observedAt: string
  baselineVersion: string
  candidateVersion: string
  cases: readonly PairedLearningCase[]
}

function text(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function score(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`)
  return value
}

/** Persist independent case-level results before recording the aggregate benchmark. */
export async function recordIndependentPairedEvaluations(input: IndependentPairedEvaluationInput) {
  const projectId = text(input.projectId, 'projectId')
  const candidateId = text(input.candidateId, 'candidateId')
  const agentKey = text(input.agentKey, 'agentKey')
  const skillKey = text(input.skillKey, 'skillKey')
  const evaluatorId = text(input.evaluatorId, 'evaluatorId')
  const benchmarkKey = text(input.benchmarkKey, 'benchmarkKey')
  const datasetKey = text(input.datasetKey, 'datasetKey')
  const baselineVersion = text(input.baselineVersion, 'baselineVersion')
  const candidateVersion = text(input.candidateVersion, 'candidateVersion')
  if (evaluatorId === agentKey) throw new Error('evaluation must be independent from the proposing agent')
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt must be a valid timestamp')
  if (!input.cases.length) throw new Error('paired evaluation cases are required')
  const caseKeys = new Set<string>()
  const evidenceRefs = new Set<string>()
  for (const item of input.cases) {
    const caseKey = item.caseKey.trim()
    if (!SHA256_CASE_KEY.test(caseKey) || caseKeys.has(caseKey)) throw new Error('case keys must be unique SHA-256 digests')
    caseKeys.add(caseKey)
    score(item.baselineScore, 'baselineScore')
    score(item.candidateScore, 'candidateScore')
    for (const ref of [item.baselineEvidenceRef, item.candidateEvidenceRef]) {
      const normalizedRef = ref.trim().toLowerCase()
      if (!UUID_EVIDENCE_REF.test(normalizedRef) || evidenceRefs.has(normalizedRef)) {
        throw new Error('evaluation evidence references must be UUIDs and unique')
      }
      evidenceRefs.add(normalizedRef)
    }
  }

  // Evidence references are currently supplied by the caller and this writer
  // marks rows non-synthetic without resolving them to canonical run outputs.
  // Keep persistence closed until a server-owned output/evaluator loader can
  // attest each case and arm. This function intentionally does not write rows.
  throw new Error('Independent paired evaluation writes are disabled until server-owned output evidence attestation is available.')
}
