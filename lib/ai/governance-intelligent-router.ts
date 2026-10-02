import { EnvironmentModelGateway } from './model-gateway'
import { createGovernanceLearningExperimentBudgetAdmission } from './governance-learning-experiment-budget'
import type { LearningExperimentQuoteProvider } from './learning-experiment-budget'
import { createGovernanceModelCostAccountingProvider } from './governance-cost-accounting'
import { createGovernanceModelRegistry } from './governance-model-registry'
import { createGovernanceProviderResiliencePolicyProvider } from './governance-provider-resilience'
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
import { ShadowDecisionIntelligentRouter } from './model-routing-shadow'

export function createGovernanceIntelligentRouter(options: { learningExperimentQuote?: LearningExperimentQuoteProvider } = {}): IntelligentModelRouter {
  const router = new EvaluationAwareIntelligentRouter({
    registry: createGovernanceModelRegistry(),
    routingPolicy: createGovernanceRoutingPolicyProvider(),
    evaluatePolicy: evaluateModelAgainstRoutingPolicy,
    fallbackGateway: new EnvironmentModelGateway(),
    createProvider: createReasoningProvider,
    resiliencePolicy: createGovernanceProviderResiliencePolicyProvider(),
  })
  const telemetry = createGovernanceTelemetryProvider()
  const shadowObserved = new ShadowDecisionIntelligentRouter(router)
  const failClosedObservable = new FailClosedRouteTelemetryRouter(shadowObserved, telemetry)
  const observable = new ObservableIntelligentRouter(
    failClosedObservable,
    telemetry,
    createGovernanceReasoningBudgetPolicyProvider(),
    createGovernanceProjectBudgetAdmissionProvider(),
    createGovernanceModelCostAccountingProvider(),
    options.learningExperimentQuote ? { admission: createGovernanceLearningExperimentBudgetAdmission(), quote: options.learningExperimentQuote } : undefined,
  )

  // All governed reasoning exits through task-specific output validation after
  // routing, budget admission, provider invocation, cost accounting, and invocation telemetry.
  return new OutputValidatedIntelligentRouter(observable, telemetry)
}
