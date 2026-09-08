import { EnvironmentModelGateway } from './model-gateway'
import { createGovernanceModelRegistry } from './governance-model-registry'
import { createReasoningProvider } from './reasoning-provider'
import { EvaluationAwareIntelligentRouter, type IntelligentModelRouter } from './intelligent-router'

export function createGovernanceIntelligentRouter(): IntelligentModelRouter {
  return new EvaluationAwareIntelligentRouter({
    registry: createGovernanceModelRegistry(),
    fallbackGateway: new EnvironmentModelGateway(),
    createProvider: createReasoningProvider,
  })
}
