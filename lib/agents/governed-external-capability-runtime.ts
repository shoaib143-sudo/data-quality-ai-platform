import {
  authorizeExternalInvocation,
  getExternalCapabilityPolicy,
  type ExternalCapabilityId,
  type ExternalInvocationRequest,
} from './external-capability-policy'
import {
  normalizeExternalEvidence,
  type ExternalEvidence,
} from './external-evidence-normalizer'

export type ExternalAdapterResult = Readonly<{
  sourceRevision: string
  findings: Array<{
    code: string
    summary: string
    severity: ExternalEvidence['findings'][number]['severity']
  }>
}>

export type ExternalCapabilityAdapter = Readonly<{
  capability: ExternalCapabilityId
  invoke: (input: Readonly<Record<string, unknown>>) => Promise<ExternalAdapterResult>
}>

export type GovernedExternalInvocation = Readonly<{
  capability: ExternalCapabilityId
  policyRepository: string
  decision: 'ALLOWED' | 'DENIED'
  reason: string
  evidence: ExternalEvidence | null
}>

export async function invokeGovernedExternalCapability(input: {
  request: ExternalInvocationRequest
  adapter: ExternalCapabilityAdapter
  payload: Readonly<Record<string, unknown>>
  observedAt: string
}): Promise<GovernedExternalInvocation> {
  const policy = getExternalCapabilityPolicy(input.request.capability)
  const decision = authorizeExternalInvocation(input.request)

  if (input.adapter.capability !== input.request.capability) {
    return {
      capability: input.request.capability,
      policyRepository: policy.repository,
      decision: 'DENIED',
      reason: 'ADAPTER_CAPABILITY_MISMATCH',
      evidence: null,
    }
  }

  if (!decision.allowed) {
    return {
      capability: input.request.capability,
      policyRepository: policy.repository,
      decision: 'DENIED',
      reason: decision.reason,
      evidence: null,
    }
  }

  const result = await input.adapter.invoke(input.payload)
  return {
    capability: input.request.capability,
    policyRepository: policy.repository,
    decision: 'ALLOWED',
    reason: decision.reason,
    evidence: normalizeExternalEvidence({
      capability: input.request.capability,
      sourceRevision: result.sourceRevision,
      observedAt: input.observedAt,
      findings: result.findings,
    }),
  }
}
