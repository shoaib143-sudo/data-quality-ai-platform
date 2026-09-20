export const CATALOG_METADATA_INDEX_TRIGGER = 'CATALOG_METADATA_INDEX'
export const CATALOG_METADATA_INDEX_VERSION = 'v1'
export const DEFAULT_CATALOG_METADATA_ASSET_BATCH = 25
export const DEFAULT_CATALOG_METADATA_CANDIDATE_BUDGET = 500

export type CatalogMetadataCursor = {
  sourceId: string | null
  assetKey: string
  fieldOffset: number
}

export type CatalogMetadataField = {
  name: string
  dataType: string | null
  nullable: boolean | null
  description: string | null
  semanticType: string | null
  ordinal: number | null
}

export type CatalogMetadataAsset = {
  id: string
  sourceId: string
  identityKey: string
  assetKey: string
  assetType: string
  namespace: string | null
  name: string
  columns: unknown
  metadata: Record<string, unknown>
}

export type CatalogMetadataCandidate = {
  objectType: 'CATALOG_ASSET' | 'CATALOG_FIELD'
  objectKey: string
  objectId: string
  content: string
  metadata: Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function nullableNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizedField(value: unknown, index: number): CatalogMetadataField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const name = text(row.name) || text(row.column_name) || text(row.field_name)
  if (!name) return null
  return {
    name,
    dataType: text(row.data_type) || text(row.type) || text(row.source_type) || null,
    nullable: nullableBoolean(row.nullable),
    description: text(row.description) || text(row.comment) || null,
    semanticType: text(row.semantic_type) || null,
    ordinal: nullableNumber(row.ordinal_position) ?? nullableNumber(row.ordinal) ?? index,
  }
}

export function normalizeCatalogMetadataCursor(value: unknown): CatalogMetadataCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { sourceId: null, assetKey: '', fieldOffset: 0 }
  }
  const record = value as Record<string, unknown>
  return {
    sourceId: text(record.sourceId) || null,
    assetKey: text(record.assetKey).toLocaleLowerCase(),
    fieldOffset: Math.max(0, Math.trunc(Number(record.fieldOffset) || 0)),
  }
}

export function catalogMetadataFields(columns: unknown): CatalogMetadataField[] {
  if (!Array.isArray(columns)) return []
  return columns.flatMap((value, index) => {
    const field = normalizedField(value, index)
    return field ? [field] : []
  })
}

export function boundCatalogMetadataAssetBatch(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_CATALOG_METADATA_ASSET_BATCH
  return Math.max(1, Math.min(100, Math.trunc(numeric)))
}

export function boundCatalogMetadataCandidateBudget(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_CATALOG_METADATA_CANDIDATE_BUDGET
  return Math.max(25, Math.min(2000, Math.trunc(numeric)))
}

function assetObjectKey(asset: CatalogMetadataAsset) {
  return `${asset.sourceId}:${asset.identityKey || asset.assetKey}`
}

function assetCandidate(asset: CatalogMetadataAsset): CatalogMetadataCandidate {
  const metadata = asset.metadata ?? {}
  const description = text(metadata.description) || text(metadata.comment)
  return {
    objectType: 'CATALOG_ASSET',
    objectKey: assetObjectKey(asset),
    objectId: asset.id,
    content: [
      asset.namespace ? `${asset.namespace}.${asset.name}` : asset.name,
      `Asset type: ${asset.assetType}`,
      description || null,
      `Source id: ${asset.sourceId}`,
    ].filter(Boolean).join('\n'),
    metadata: {
      asset_id: asset.id,
      source_id: asset.sourceId,
      identity_key: asset.identityKey,
      asset_key: asset.assetKey,
      asset_type: asset.assetType,
      namespace: asset.namespace,
      name: asset.name,
    },
  }
}

function fieldCandidate(asset: CatalogMetadataAsset, field: CatalogMetadataField): CatalogMetadataCandidate {
  const qualifiedAsset = asset.namespace ? `${asset.namespace}.${asset.name}` : asset.name
  return {
    objectType: 'CATALOG_FIELD',
    objectKey: `${assetObjectKey(asset)}:${field.name.toLocaleLowerCase()}`,
    objectId: asset.id,
    content: [
      `${qualifiedAsset}.${field.name}`,
      field.description,
      field.dataType ? `Data type: ${field.dataType}` : null,
      field.semanticType ? `Semantic type: ${field.semanticType}` : null,
      field.nullable === null ? null : `Nullable: ${field.nullable}`,
    ].filter(Boolean).join('\n'),
    metadata: {
      asset_id: asset.id,
      source_id: asset.sourceId,
      identity_key: asset.identityKey,
      asset_key: asset.assetKey,
      asset_type: asset.assetType,
      namespace: asset.namespace,
      asset_name: asset.name,
      column_name: field.name,
      data_type: field.dataType,
      nullable: field.nullable,
      semantic_type: field.semanticType,
      ordinal: field.ordinal,
    },
  }
}

export function planCatalogMetadataCandidates(input: {
  assets: CatalogMetadataAsset[]
  cursor?: unknown
  candidateBudget?: number
}) {
  const cursor = normalizeCatalogMetadataCursor(input.cursor)
  const budget = boundCatalogMetadataCandidateBudget(input.candidateBudget)
  const candidates: CatalogMetadataCandidate[] = []
  let lastCompletedAssetKey = cursor.assetKey

  for (let assetIndex = 0; assetIndex < input.assets.length; assetIndex += 1) {
    const asset = input.assets[assetIndex]
    const resumesCurrent = assetIndex === 0
      && cursor.fieldOffset > 0
      && cursor.sourceId === asset.sourceId
      && cursor.assetKey === asset.assetKey

    const fields = catalogMetadataFields(asset.columns)
    let fieldIndex = resumesCurrent ? cursor.fieldOffset : 0

    if (!resumesCurrent) {
      if (candidates.length >= budget) {
        return {
          candidates,
          nextCursor: {
            sourceId: asset.sourceId,
            assetKey: lastCompletedAssetKey,
            fieldOffset: 0,
          },
          partialAsset: false,
        }
      }
      candidates.push(assetCandidate(asset))
    }

    while (fieldIndex < fields.length) {
      if (candidates.length >= budget) {
        return {
          candidates,
          nextCursor: {
            sourceId: asset.sourceId,
            assetKey: asset.assetKey,
            fieldOffset: fieldIndex,
          },
          partialAsset: true,
        }
      }
      candidates.push(fieldCandidate(asset, fields[fieldIndex]))
      fieldIndex += 1
    }

    lastCompletedAssetKey = asset.assetKey
  }

  const last = input.assets.at(-1)
  return {
    candidates,
    nextCursor: last
      ? { sourceId: last.sourceId, assetKey: last.assetKey, fieldOffset: 0 }
      : cursor,
    partialAsset: false,
  }
}
