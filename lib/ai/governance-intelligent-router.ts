import { EnvironmentModelGateway } from './model-gateway'
import { createGovernanceModelRegistry } from './governance-model-registry'
import { createGovernanceReasoningBudgetPolicyProvider } from './governance-reasoning-budget-policy'
import { createGovernanceProjectBudgetAdmissionProvider } from './governance-resource-budget-admission'
import { createGovernanceRoutingPolicyProvider } from './governance-routing-policy'
import { createGovernanceTelemetryProvider } from './governance-telemetry-provider'
import { ObservableIntelligentRouter } from './observable-intelligent-router'
import { createReasoningProvider } from './reasoning-provider'
import { evaluateModelAgainstRoutingPolicy } from './routing-policy'
import { EvaluationAwareIntelligentRouter, type IntelligentModelRouter } from './intelligent-router'

export function createGovernanceIntelligentRouter(): IntelligentModelRouter {
  const router = new EvaluationAwareIntelligentRouter({
    registry: createGovernanceModelRegistry(),
    routingPolicy: createGovernanceRoutingPolicyProvider(),
    evaluatePolicy: evaluateModelAgainstRoutingPolicy,
    fallbackGateway: new EnvironmentModelGateway(),
    createProvider: createReasoningProvider,
  })

  return new ObservableIntelligentRouter(
    router,
    createGovernanceTelemetryProvider(),
    createGovernanceReasoningBudgetPolicyProvider(),
    createGovernanceProjectBudgetAdmissionProvider(),
  )
}
