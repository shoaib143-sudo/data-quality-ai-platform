import { createHash } from 'node:crypto'
import type { DecisionProvider, DecisionResult } from './decision-provider.ts'
import type { DecisionDefinition } from './decision-registry.ts'
import { evaluateDecisionConfidence, type DecisionPolicyOutcome } from './decision-policy.ts'
import { DecisionPayloadBuilder } from './decision-payload-builder.ts'

export type DecisionReceipt = {
  decisionFamily: string
  schemaVersion: string
  provider: string
  model: string
  providerRequestId: string | null
  stateFingerprint: string
  lifecycle: DecisionDefinition['lifecycle']
  answers: DecisionResult['answers']
  usage: DecisionResult['usage']
  latencyMs: number
  policy: DecisionPolicyOutcome
  enforcementResult: 'SHADOW_ONLY' | 'ADVISORY_ONLY' | 'ELIGIBLE_FOR_POLICY_EVALUATION'
  correlationId: string | null
  createdAt: string
}

export interface DecisionReceiptSink {
  record(receipt: DecisionReceipt): Promise<void>
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function decisionStateFingerprint(value: unknown) {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

export class DecisionGateway {
  private readonly provider: DecisionProvider
  private readonly payloadBuilder: DecisionPayloadBuilder
  private readonly receiptSink?: DecisionReceiptSink

  constructor(input: { provider: DecisionProvider; payloadBuilder?: DecisionPayloadBuilder; receiptSink?: DecisionReceiptSink }) {
    this.provider = input.provider
    this.payloadBuilder = input.payloadBuilder ?? new DecisionPayloadBuilder()
    this.receiptSink = input.receiptSink
  }

  async evaluate(input: {
    definition: DecisionDefinition
    state: unknown
    correlationId?: string | null
    signal?: AbortSignal
  }): Promise<DecisionReceipt> {
    if (this.provider.state !== 'AVAILABLE' && input.definition.failureMode === 'FAIL_CLOSED') {
      throw new Error(`Decision provider ${this.provider.id} is ${this.provider.state}; ${input.definition.family} fails closed.`)
    }
    const minimized = this.payloadBuilder.build(input.state) as string | Record<string, unknown> | unknown[]
    const result = await this.provider.evaluate({
      decisionFamily: input.definition.family,
      schemaVersion: input.definition.schemaVersion,
      state: minimized,
      questions: input.definition.questions,
      signal: input.signal,
      timeoutMs: input.definition.timeoutMs,
      correlationId: input.correlationId,
    })
    const policy = evaluateDecisionConfidence(input.definition, result)
    const enforcementResult = policy.enforcementEligible
      ? 'ELIGIBLE_FOR_POLICY_EVALUATION'
      : input.definition.lifecycle === 'ADVISORY'
        ? 'ADVISORY_ONLY'
        : 'SHADOW_ONLY'
    const receipt: DecisionReceipt = {
      decisionFamily: input.definition.family,
      schemaVersion: input.definition.schemaVersion,
      provider: result.provider,
      model: result.model,
      providerRequestId: result.providerRequestId ?? null,
      stateFingerprint: decisionStateFingerprint(minimized),
      lifecycle: input.definition.lifecycle,
      answers: result.answers,
      usage: result.usage,
      latencyMs: result.latencyMs,
      policy,
      enforcementResult,
      correlationId: input.correlationId ?? null,
      createdAt: new Date().toISOString(),
    }
    await this.receiptSink?.record(receipt)
    return receipt
  }
}
