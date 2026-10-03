import type { CanonicalGovernanceObject, ProviderProjection } from '../../canonical/model.ts'
import { stableGovernanceFingerprint } from '../../planning/fingerprint.ts'

export type InformaticaAssetRecord = {
  id: string
  name: string
  externalKey?: string
  description?: string
  attributes?: Record<string, unknown>
}

export type NormalizedInformaticaAsset = {
  object: CanonicalGovernanceObject
  projection: ProviderProjection
}

export function normalizeInformaticaAsset(
  record: InformaticaAssetRecord,
  projectId: string,
  connectionId: string,
  observedAt: string,
): NormalizedInformaticaAsset {
  if (!record.id?.trim() || !record.name?.trim()) throw new Error('Informatica asset id and name are required.')
  const externalKey = record.externalKey?.trim() || record.id.trim()
  const object: CanonicalGovernanceObject = {
    id: `technical-asset:${externalKey}`,
    type: 'TECHNICAL_ASSET',
    externalKey,
    name: record.name.trim(),
    description: record.description,
    projectId,
    attributes: { ...(record.attributes ?? {}) },
    relationships: [],
    version: 1,
  }
  return {
    object,
    projection: {
      provider: 'informatica',
      connectionId,
      canonicalObjectId: object.id,
      providerObjectId: record.id.trim(),
      lastObservedFingerprint: stableGovernanceFingerprint(object),
      lastObservedAt: observedAt,
      syncState: 'IN_SYNC',
    },
  }
}
