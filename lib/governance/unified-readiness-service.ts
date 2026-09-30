import { ALL_READINESS_CAPABILITIES, readinessCapabilitiesForContext, type ReadinessContext } from './unified-readiness-framework.ts'
import { evaluateReadiness, type ReadinessEvidence } from './unified-readiness-engine.ts'
import { planMinimumQuestions } from './unified-readiness-planner.ts'
import { READINESS_LENSES, evaluateLens } from './unified-readiness-lenses.ts'
import { proposeReadinessActions } from './unified-readiness-actions.ts'

export function buildUnifiedReadinessProjection(context: ReadinessContext, evidence: readonly ReadinessEvidence[]) {
  const capabilities=readinessCapabilitiesForContext(context)
  const readiness=evaluateReadiness(capabilities,evidence)
  const questions=planMinimumQuestions(context,evidence)
  const requestedLenses=new Set(['DATA_READINESS','GOVERNANCE_READINESS',...(context.useCases ?? [])])
  const lenses=READINESS_LENSES.filter(lens=>requestedLenses.has(lens.id)).map(lens=>evaluateLens(lens,readiness.capabilities))
  const actions=proposeReadinessActions(ALL_READINESS_CAPABILITIES,readiness.capabilities)
  return { frameworkVersion:'DN-URA-1.0' as const, capabilities, readiness, questions, lenses, actions }
}
