import { CANONICAL_GOVERNANCE_SCHEMA_VERSION } from '../../canonical/model'
import type { ProviderManifest } from '../sdk/provider'

export const INFORMATICA_PROVIDER_VERSION = '0.1.0' as const

export const informaticaManifest: ProviderManifest = {
  provider: 'informatica',
  providerVersion: INFORMATICA_PROVIDER_VERSION,
  canonicalSchemaVersion: CANONICAL_GOVERNANCE_SCHEMA_VERSION,
  capabilities: [
    {
      capability: 'catalog.asset.read',
      support: 'FULL',
      modes: ['READ'],
      consistency: 'EVENTUAL',
      execution: 'SYNC',
      idempotency: 'NATIVE',
      rollback: 'NONE',
      verification: 'READ_BACK',
      apiVersion: 'provider-configured',
      limitations: ['Endpoint mapping is supplied by the configured Informatica API adapter.'],
    },
    {
      capability: 'lineage.read',
      support: 'FULL',
      modes: ['READ'],
      consistency: 'EVENTUAL',
      execution: 'SYNC',
      idempotency: 'NATIVE',
      rollback: 'NONE',
      verification: 'READ_BACK',
      apiVersion: 'provider-configured',
    },
  ],
}
