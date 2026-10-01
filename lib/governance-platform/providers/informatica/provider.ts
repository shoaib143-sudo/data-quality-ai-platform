import type { ProviderCapability } from '../sdk/capability'
import { GovernanceProviderError } from '../sdk/errors'
import type { DiscoveryRequest, DiscoveryResult, ExecutionResult, GovernanceOperation, GovernanceProvider, VerificationResult } from '../sdk/provider'
import { InformaticaApiClient } from './client'
import { informaticaManifest } from './manifest'
import { normalizeInformaticaAsset, type InformaticaAssetRecord } from './normalizer'

export type InformaticaEndpointResolver = {
  assets(request: DiscoveryRequest): string
}

function assetRecords(payload: unknown): InformaticaAssetRecord[] {
  if (Array.isArray(payload)) return payload as InformaticaAssetRecord[]
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>
    for (const key of ['items', 'results', 'assets']) if (Array.isArray(candidate[key])) return candidate[key] as InformaticaAssetRecord[]
  }
  throw new GovernanceProviderError('VALIDATION_FAILED', 'Informatica asset response shape is unsupported.')
}

export class InformaticaGovernanceProvider implements GovernanceProvider {
  constructor(private readonly client: InformaticaApiClient, private readonly endpoints: InformaticaEndpointResolver) {}

  manifest() { return informaticaManifest }
  async capabilities(): Promise<ProviderCapability[]> { return informaticaManifest.capabilities }

  async discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const payload = await this.client.getJson(this.endpoints.assets(request))
    const observedAt = new Date().toISOString()
    const normalized = assetRecords(payload).map(record => normalizeInformaticaAsset(record, request.projectId, request.connectionId, observedAt))
    return {
      objects: normalized.map(value => value.object),
      projections: normalized.map(value => value.projection),
      observedAt,
    }
  }

  async execute(_operation: GovernanceOperation): Promise<ExecutionResult> {
    throw new GovernanceProviderError('UNSUPPORTED_CAPABILITY', 'Informatica mutations are not enabled in the read-only provider foundation.')
  }

  async verify(operation: GovernanceOperation, result: ExecutionResult): Promise<VerificationResult> {
    if (result.status === 'PENDING') return { operationId: operation.operationId, status: 'PENDING' }
    return { operationId: operation.operationId, status: 'MANUAL', details: { reason: 'Read-only foundation has no mutation to verify.' } }
  }
}
