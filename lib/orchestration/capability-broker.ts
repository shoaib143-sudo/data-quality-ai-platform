import type { WorkflowAuthorizationEnvelope } from './workflow-authorization-envelope'
import { assertWorkflowAuthorizationEnvelopeCurrent } from './workflow-authorization-envelope'

export type CapabilityProviderKind = 'INTERNAL' | 'TOOL' | 'MCP'

export type CapabilityProvider<TInput = unknown, TOutput = unknown> = {
  key: string
  kind: CapabilityProviderKind
  execute(input: TInput, context: { envelope: WorkflowAuthorizationEnvelope; correlationId: string }): Promise<TOutput>
}

export class CapabilityBroker {
  private readonly providers = new Map<string, CapabilityProvider>()

  register(provider: CapabilityProvider) {
    if (!provider.key.trim()) throw new Error('Capability provider key is required.')
    if (this.providers.has(provider.key)) throw new Error(`Capability provider already registered: ${provider.key}`)
    this.providers.set(provider.key, provider)
  }

  async execute<TInput, TOutput>(input: {
    capabilityKey: string
    payload: TInput
    envelope: WorkflowAuthorizationEnvelope
    correlationId: string
  }): Promise<TOutput> {
    assertWorkflowAuthorizationEnvelopeCurrent(input.envelope)
    if (input.envelope.capability !== input.capabilityKey) {
      throw new Error('Capability request does not match the authorized envelope.')
    }
    if (!input.correlationId.trim()) throw new Error('Capability execution requires a correlationId.')
    const provider = this.providers.get(input.capabilityKey)
    if (!provider) throw new Error(`No governed provider is registered for capability ${input.capabilityKey}.`)
    return provider.execute(input.payload, { envelope: input.envelope, correlationId: input.correlationId }) as Promise<TOutput>
  }
}
