import { EnvironmentModelGateway } from './model-gateway'
import { createGovernanceModelRegistry } from './governance-model-registry'
import { createGovernanceRoutingPolicyProvider } from './governance-routing-policy'
import { createReasoningProvider } from './reasoning-provider'
import { evaluateModelAgainstRoutingPolicy } from './routing-policy'
import { EvaluationAwareIntelligentRouter, type IntelligentModelRouter } from './intelligent-router'

export function createGovernanceIntelligentRouter(): IntelligentModelRouter {
  return new EvaluationAwareIntelligentRouter({
    registry: createGovernanceModelRegistry(),
    routingPolicy: createGovernanceRoutingPolicyProvider(),
    evaluatePolicy: evaluateModelAgainstRoutingPolicy,
    fallbackGateway: new EnvironmentModelGateway(),
    createProvider: createReasoningProvider,
  })
}
