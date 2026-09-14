import { createHash } from 'node:crypto'
import type { ExecutionFingerprintInput } from './agent-policy-v2'

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, normalize(entry)])
    return Object.fromEntries(entries)
  }
  return value
}

export function canonicalExecutionFingerprintPayload(input: ExecutionFingerprintInput) {
  return normalize({
    actionKey: input.actionKey,
    environment: input.environment,
    projectId: input.projectId,
    resourceIds: [...input.resourceIds].sort(),
    parameters: input.parameters,
    policyVersion: input.policyVersion,
    businessCriticality: input.businessCriticality,
    dataSensitivity: input.dataSensitivity,
    materialProductionMutation: input.materialProductionMutation,
    financialImpact: input.financialImpact,
    productionScope: input.productionScope,
    reversibility: input.reversibility,
    computeCost: input.computeCost,
  })
}

export function createExecutionFingerprint(input: ExecutionFingerprintInput): string {
  const payload = canonicalExecutionFingerprintPayload(input)
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}
