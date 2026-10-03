import type { DecisionAnswer, DecisionResult } from './decision-provider.ts'
import type { DecisionDefinition } from './decision-registry.ts'

export type DecisionConfidenceBand = 'CONFIDENT' | 'UNCERTAIN'
export type DecisionPolicyOutcome = {
  band: DecisionConfidenceBand
  minimumObservedConfidence: number
  enforcementEligible: boolean
  reason: string
}

function answerConfidence(answer: DecisionAnswer) {
  if (answer.type === 'noul') return Math.max(answer.noul, 1 - answer.noul)
  return answer.confidence
}

export function evaluateDecisionConfidence(definition: DecisionDefinition, result: DecisionResult): DecisionPolicyOutcome {
  const required = Object.keys(definition.questions)
  if (!required.length) throw new Error('Decision definition has no questions.')
  const confidences = required.map(name => {
    const answer = result.answers[name]
    if (!answer) throw new Error(`Decision result is missing ${name}.`)
    return answerConfidence(answer)
  })
  const minimumObservedConfidence = Math.min(...confidences)
  if (minimumObservedConfidence < definition.minimumConfidence) {
    return {
      band: 'UNCERTAIN',
      minimumObservedConfidence,
      enforcementEligible: false,
      reason: 'At least one semantic answer is below the governed confidence threshold.',
    }
  }
  return {
    band: 'CONFIDENT',
    minimumObservedConfidence,
    enforcementEligible: definition.lifecycle === 'ACTIVE' && definition.enforcementEligible,
    reason: definition.lifecycle === 'ACTIVE' && definition.enforcementEligible
      ? 'Semantic result meets the active governed threshold.'
      : 'Semantic result is confident but the decision family is not active for enforcement.',
  }
}
