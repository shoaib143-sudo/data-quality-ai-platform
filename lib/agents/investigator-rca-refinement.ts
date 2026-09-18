import type {
  InvestigatorEvidenceAnalysis,
  InvestigatorHypothesis,
} from './investigator-evidence-discrimination'
import { runAgentExcellenceRecursion } from './runtime/agent-excellence-runtime'
import type { BoundedRecursionResult } from './runtime/bounded-recursion-runtime'

export type InvestigatorRcaAssessment = {
  datasetId: string
  hypothesisKey: InvestigatorHypothesis['hypothesisKey']
  disposition: 'PROBABLE' | 'ALTERNATIVE' | 'EVIDENCE_LIMITATION'
  evidenceStrength: InvestigatorHypothesis['evidenceStrength']
  evidence: string[]
  discriminatingEvidenceNeeded: string[]
  rationale: string
}

export type InvestigatorRcaRefinementState = {
  candidateKeys: string[]
  testedKeys: string[]
  assessments: InvestigatorRcaAssessment[]
}

export type InvestigatorRcaRefinementOutput = {
  assessments: InvestigatorRcaAssessment[]
  probableCauses: InvestigatorRcaAssessment[]
  alternativeCauses: InvestigatorRcaAssessment[]
  evidenceLimitations: InvestigatorRcaAssessment[]
  untestedCandidateKeys: string[]
  coverage: {
    tested: number
    total: number
    complete: boolean
  }
}

function candidateKey(hypothesis: InvestigatorHypothesis) {
  return `${hypothesis.datasetId}:${hypothesis.hypothesisKey}`
}

function disposition(hypothesis: InvestigatorHypothesis): InvestigatorRcaAssessment['disposition'] {
  if (hypothesis.hypothesisKey === 'PROFILE_EXECUTION') return 'EVIDENCE_LIMITATION'
  if (hypothesis.evidenceStrength === 'HIGH') return 'PROBABLE'
  return 'ALTERNATIVE'
}

function assess(hypothesis: InvestigatorHypothesis): InvestigatorRcaAssessment {
  const nextDisposition = disposition(hypothesis)
  const rationale = nextDisposition === 'PROBABLE'
    ? 'The hypothesis has HIGH deterministic evidence strength from same-dataset evidence and is retained as a probable cause candidate. This is not a calibrated causal probability.'
    : nextDisposition === 'EVIDENCE_LIMITATION'
      ? 'The signal describes incomplete or failed profiling evidence, so it limits diagnosis rather than establishing an underlying causal mechanism.'
      : 'The hypothesis remains a plausible alternative, but the bounded evidence does not support promoting it to a probable cause candidate.'

  return {
    datasetId: hypothesis.datasetId,
    hypothesisKey: hypothesis.hypothesisKey,
    disposition: nextDisposition,
    evidenceStrength: hypothesis.evidenceStrength,
    evidence: [...hypothesis.evidence],
    discriminatingEvidenceNeeded: [...hypothesis.discriminatingEvidenceNeeded],
    rationale,
  }
}

function outputFor(state: InvestigatorRcaRefinementState): InvestigatorRcaRefinementOutput {
  const tested = new Set(state.testedKeys)
  const untestedCandidateKeys = state.candidateKeys.filter((key) => !tested.has(key))
  return {
    assessments: [...state.assessments],
    probableCauses: state.assessments.filter((assessment) => assessment.disposition === 'PROBABLE'),
    alternativeCauses: state.assessments.filter((assessment) => assessment.disposition === 'ALTERNATIVE'),
    evidenceLimitations: state.assessments.filter((assessment) => assessment.disposition === 'EVIDENCE_LIMITATION'),
    untestedCandidateKeys,
    coverage: {
      tested: state.testedKeys.length,
      total: state.candidateKeys.length,
      complete: untestedCandidateKeys.length === 0,
    },
  }
}

export async function refineInvestigatorRca(
  analysis: InvestigatorEvidenceAnalysis,
): Promise<BoundedRecursionResult<InvestigatorRcaRefinementState, InvestigatorRcaRefinementOutput>> {
  const hypotheses = [...analysis.hypotheses].sort((left, right) => {
    const strengthRank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
    return strengthRank[left.evidenceStrength] - strengthRank[right.evidenceStrength]
      || candidateKey(left).localeCompare(candidateKey(right))
  })
  const byKey = new Map(hypotheses.map((hypothesis) => [candidateKey(hypothesis), hypothesis] as const))
  const initialState: InvestigatorRcaRefinementState = {
    candidateKeys: hypotheses.map(candidateKey),
    testedKeys: [],
    assessments: [],
  }

  return runAgentExcellenceRecursion({
    agentKey: 'investigator_agent',
    initialState,
    async runIteration(context) {
      const tested = new Set(context.state.testedKeys)
      const nextKey = context.state.candidateKeys.find((key) => !tested.has(key))
      if (!nextKey) {
        return {
          state: context.state,
          output: outputFor(context.state),
          confidence: 1,
          toolCallsUsed: 0,
          handoffsUsed: 0,
          materialImprovement: false,
        }
      }

      const hypothesis = byKey.get(nextKey)
      if (!hypothesis) throw new Error(`Investigator RCA candidate disappeared: ${nextKey}`)
      const nextState: InvestigatorRcaRefinementState = {
        candidateKeys: context.state.candidateKeys,
        testedKeys: [...context.state.testedKeys, nextKey],
        assessments: [...context.state.assessments, assess(hypothesis)],
      }
      const nextOutput = outputFor(nextState)

      return {
        state: nextState,
        output: nextOutput,
        confidence: nextOutput.coverage.complete ? 1 : 0,
        toolCallsUsed: 0,
        handoffsUsed: 0,
        materialImprovement: true,
      }
    },
  })
}
