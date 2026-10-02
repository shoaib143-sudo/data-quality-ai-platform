import { isJevShadowRuntimeEnabled } from './decision-runtime.ts'
import { getDecisionDefinition } from './decision-registry.ts'
import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router.ts'

export type ModelRoutingShadowObserver = (context: IntelligentRouteContext) => Promise<void>

export async function observeModelRoutingShadow(context: IntelligentRouteContext): Promise<void> {
  if (!isJevShadowRuntimeEnabled()) return
  const { createGovernanceShadowDecisionGateway } = await import('./governance-decision-runtime.ts')
  const gateway = createGovernanceShadowDecisionGateway({ projectId: context.projectId })
  if (!gateway) return
  try {
    await gateway.evaluate({
      definition: getDecisionDefinition('MODEL_ROUTING'),
      correlationId: context.executionCorrelationId ?? null,
      signal: context.signal,
      state: {
        task: context.task,
        sensitivity: context.sensitivity ?? 'UNSPECIFIED',
        risk: context.risk ?? 'UNSPECIFIED',
        agentDefinitionId: context.agentDefinitionId ?? null,
        learningExperiment: Boolean(context.learningExperiment),
      },
    })
  } catch {
    // MODEL_ROUTING is SHADOW only. Observation failure must not alter the
    // canonical governed routing result.
  }
}

export class ShadowDecisionIntelligentRouter implements IntelligentModelRouter {
  private readonly inner: IntelligentModelRouter
  private readonly observe: ModelRoutingShadowObserver

  constructor(inner: IntelligentModelRouter, observe: ModelRoutingShadowObserver = observeModelRoutingShadow) {
    this.inner = inner
    this.observe = observe
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const [decision] = await Promise.all([
      this.inner.route(context),
      this.observe(context).catch(() => undefined),
    ])
    return decision
  }
}
