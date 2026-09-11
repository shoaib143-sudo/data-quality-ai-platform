import { EnvironmentModelGateway } from './model-gateway'
import { createGovernanceModelCostAccountingProvider } from './governance-cost-accounting'
import { createGovernanceModelRegistry } from './governance-model-registry'
import { createGovernanceReasoningBudgetPolicyProvider } from './governance-reasoning-budget-policy'
import { createGovernanceProjectBudgetAdmissionProvider } from './governance-resource-budget-admission'
import { createGovernanceRoutingPolicyProvider } from './governance-routing-policy'
import { createGovernanceTelemetryProvider } from './governance-telemetry-provider'
import { FailClosedRouteTelemetryRouter } from './fail-closed-route-telemetry-router'
import { ObservableIntelligentRouter } from './observable-intelligent-router'
import { OutputValidatedIntelligentRouter } from './output-validated-intelligent-router'
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
  const telemetry = createGovernanceTelemetryProvider()
  const failClosedObservable = new FailClosedRouteTelemetryRouter(router, telemetry)
  const observable = new ObservableIntelligentRouter(
    failClosedObservable,
    telemetry,
    createGovernanceReasoningBudgetPolicyProvider(),
    createGovernanceProjectBudgetAdmissionProvider(),
    createGovernanceModelCostAccountingProvider(),
  )

  // All governed reasoning exits through task-specific output validation after
  // routing, budget admission, provider invocation, cost accounting, and invocation telemetry.
  return new OutputValidatedIntelligentRouter(observable, telemetry)
}
