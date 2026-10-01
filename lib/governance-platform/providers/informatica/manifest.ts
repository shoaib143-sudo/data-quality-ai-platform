import { CANONICAL_GOVERNANCE_SCHEMA_VERSION } from '../../canonical/model.ts'
import type { ProviderManifest } from '../sdk/provider.ts'

export const INFORMATICA_PROVIDER_VERSION = '0.1.0' as const

export const informaticaManifest: ProviderManifest = {
  provider: 'informatica',
  providerVersion: INFORMATICA_PROVIDER_VERSION,
  canonicalSchemaVersion: CANONICAL_GOVERNANCE_SCHEMA_VERSION,
  capabilities: [
    {
      capability: 'catalog.asset.read',
      support: 'PARTIAL',
      modes: ['READ'],
      consistency: 'EVENTUAL',
      execution: 'SYNC',
      idempotency: 'NATIVE',
      rollback: 'NONE',
      verification: 'READ_BACK',
      apiVersion: 'provider-configured',
      limitations: [
        'Read-only discovery is enabled only through an explicitly configured public Informatica API endpoint mapping.',
        'Provider-specific pagination and object-type coverage remain adapter responsibilities until endpoint conformance is certified.',
      ],
    },
    {
      capability: 'lineage.read',
      support: 'UNSUPPORTED',
      modes: ['READ'],
      consistency: 'EVENTUAL',
      execution: 'SYNC',
      idempotency: 'NATIVE',
      rollback: 'NONE',
      verification: 'READ_BACK',
      apiVersion: 'provider-configured',
      limitations: ['Lineage endpoint mapping and canonical normalization are not yet implemented in the Informatica reference adapter.'],
    },
  ],
}
