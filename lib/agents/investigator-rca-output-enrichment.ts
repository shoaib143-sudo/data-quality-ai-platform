import type { InvestigatorEvidenceAnalysis } from './investigator-evidence-discrimination'
import { refineInvestigatorRca } from './investigator-rca-refinement'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function boundedAnalysis(output: Record<string, unknown>): InvestigatorEvidenceAnalysis | null {
  const specialist = record(output.specialist)
  if (!specialist) return null

  const evidence = record(specialist.evidence)
  const hypotheses = array(specialist.hypotheses)
  const datasets = array(evidence?.datasetEvidence)
  const recommendations = array(specialist.recommendations)
  const unresolved = array(specialist.unresolved)

  if (!hypotheses.length) return null

  return {
    datasets,
    hypotheses,
    recommendations,
    unresolved,
  } as InvestigatorEvidenceAnalysis
}

export async function enrichInvestigatorOutputWithBoundedRca(
  output: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (record(output.rcaRefinement)) return output

  const analysis = boundedAnalysis(output)
  if (!analysis) return output

  const refinement = await refineInvestigatorRca(analysis)
  return {
    ...output,
    rcaRefinement: {
      probableCauses: refinement.output.probableCauses,
      alternativeCauses: refinement.output.alternativeCauses,
      evidenceLimitations: refinement.output.evidenceLimitations,
      untestedCandidateKeys: refinement.output.untestedCandidateKeys,
      coverage: refinement.output.coverage,
      recursion: {
        iterations: refinement.iterations,
        toolCallsUsed: refinement.toolCallsUsed,
        handoffsUsed: refinement.handoffsUsed,
        elapsedMs: refinement.elapsedMs,
        stopReason: refinement.stopReason,
        confidenceSemantics: 'COVERAGE_COMPLETION_ONLY',
      },
    },
  }
}
