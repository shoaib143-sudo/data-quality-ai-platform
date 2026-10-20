import type { CapabilityProvider } from './capability-broker'

export type GovernedMcpClient<TInput = unknown, TOutput = unknown> = {
  call(input: {
    serverKey: string
    operationKey: string
    payload: TInput
    correlationId: string
  }): Promise<TOutput>
}

export function createMcpCapabilityProvider<TInput, TOutput>(input: {
  capabilityKey: string
  serverKey: string
  operationKey: string
  client: GovernedMcpClient<TInput, TOutput>
}): CapabilityProvider<TInput, TOutput> {
  if (!input.capabilityKey.trim() || !input.serverKey.trim() || !input.operationKey.trim()) throw new Error('MCP capability binding requires capability, server and operation keys.')
  return {
    key: input.capabilityKey,
    kind: 'MCP',
    execute: (payload, context) => input.client.call({
      serverKey: input.serverKey,
      operationKey: input.operationKey,
      payload,
      correlationId: context.correlationId,
    }),
  }
}
