import { DecisionGateway } from './decision-gateway.ts'
import { DecisionPayloadBuilder } from './decision-payload-builder.ts'
import { getJevDecisionProvider } from './jev-decision-provider.ts'
import type { BuiltinDecisionFamily } from './decision-registry.ts'
import { getDecisionDefinition } from './decision-registry.ts'

export function isJevShadowRuntimeEnabled() {
  return process.env.JEV_SHADOW_RUNTIME_ENABLED?.trim().toLowerCase() === 'true'
}

export type DecisionRuntimeStatus = {
  configured: boolean
  shadowRuntimeEnabled: boolean
  providerId: string | null
  providerState: 'AVAILABLE' | 'BYPASSED'
  lifecycle: Record<BuiltinDecisionFamily, 'SHADOW' | 'ADVISORY' | 'ACTIVE' | 'DRAFT' | 'RETIRED'>
  enforcementEnabled: false
}

export function readDecisionRuntimeStatus(): DecisionRuntimeStatus {
  const provider = getJevDecisionProvider()
  const shadowRuntimeEnabled = isJevShadowRuntimeEnabled()
  return {
    configured: Boolean(provider),
    shadowRuntimeEnabled,
    providerId: provider?.id ?? null,
    providerState: provider && shadowRuntimeEnabled ? 'AVAILABLE' : 'BYPASSED',
    lifecycle: {
      TOOL_RISK: getDecisionDefinition('TOOL_RISK').lifecycle,
      PROMPT_SECURITY: getDecisionDefinition('PROMPT_SECURITY').lifecycle,
      RAG_GROUNDING: getDecisionDefinition('RAG_GROUNDING').lifecycle,
      MODEL_ROUTING: getDecisionDefinition('MODEL_ROUTING').lifecycle,
      AGENT_TRACE_EVALUATION: getDecisionDefinition('AGENT_TRACE_EVALUATION').lifecycle,
    },
    enforcementEnabled: false,
  }
}

/**
 * Returns null when Jev is not configured. Callers must preserve their existing
 * deterministic behavior in that case. This factory never enables enforcement.
 */
export function createShadowDecisionGateway() {
  if (!isJevShadowRuntimeEnabled()) return null
  const provider = getJevDecisionProvider()
  if (!provider) return null
  return new DecisionGateway({
    provider,
    payloadBuilder: new DecisionPayloadBuilder(),
  })
}
