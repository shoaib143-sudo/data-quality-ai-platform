import type { CanonicalGovernanceObject } from '../../canonical/model'

export type InformaticaAssetRecord = {
  id: string
  name: string
  externalKey?: string
  description?: string
  attributes?: Record<string, unknown>
}

export function normalizeInformaticaAsset(
  record: InformaticaAssetRecord,
  projectId: string,
): CanonicalGovernanceObject {
  if (!record.id?.trim() || !record.name?.trim()) throw new Error('Informatica asset id and name are required.')
  return {
    id: `informatica:${record.id}`,
    type: 'TECHNICAL_ASSET',
    externalKey: record.externalKey?.trim() || record.id,
    name: record.name.trim(),
    description: record.description,
    projectId,
    attributes: { ...(record.attributes ?? {}), provider: 'informatica', providerObjectId: record.id },
    relationships: [],
    version: 1,
  }
}
