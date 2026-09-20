import { createAdminClient } from '@/lib/supabase/admin'
import {
  boundCatalogMetadataAssetBatch,
  normalizeCatalogMetadataCursor,
  planCatalogMetadataCandidates,
  type CatalogMetadataAsset,
  type CatalogMetadataCursor,
} from '@/lib/governance/catalog-metadata-semantic-contract'
import { indexSemanticObject } from '@/lib/governance/semantic-search'

function nextSource(sourceIds: string[], currentSourceId: string | null) {
  if (!sourceIds.length) return null
  if (!currentSourceId) return sourceIds[0]
  const currentIndex = sourceIds.indexOf(currentSourceId)
  if (currentIndex >= 0) return sourceIds[currentIndex + 1] ?? null
  return sourceIds.find((sourceId) => sourceId.localeCompare(currentSourceId) > 0) ?? null
}

async function loadCurrentAsset(
  projectSourceIds: Set<string>,
  sourceId: string,
  assetKey: string,
): Promise<CatalogMetadataAsset | null> {
  if (!projectSourceIds.has(sourceId) || !assetKey) return null
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').from('discovered_assets')
    .select('id,source_id,identity_key,asset_key,asset_type,namespace,name,columns,metadata')
    .eq('source_id', sourceId)
    .eq('asset_key', assetKey)
    .eq('is_current', true)
    .maybeSingle()
  if (error) throw new Error(`Unable to resume catalog metadata asset: ${error.message}`)
  if (!data) return null
  return {
    id: String(data.id),
    sourceId: String(data.source_id),
    identityKey: String(data.identity_key ?? data.asset_key),
    assetKey: String(data.asset_key),
    assetType: String(data.asset_type),
    namespace: data.namespace ? String(data.namespace) : null,
    name: String(data.name),
    columns: data.columns,
    metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata as Record<string, unknown>
      : {},
  }
}

async function loadAssetPage(input: {
  sourceId: string
  afterAssetKey: string
  limit: number
}) {
  const admin = createAdminClient()
  let query = admin.schema('catalog').from('discovered_assets')
    .select('id,source_id,identity_key,asset_key,asset_type,namespace,name,columns,metadata')
    .eq('source_id', input.sourceId)
    .eq('is_current', true)
    .order('asset_key', { ascending: true })
    .limit(input.limit)

  if (input.afterAssetKey) query = query.gt('asset_key', input.afterAssetKey)
  const { data, error } = await query
  if (error) throw new Error(`Unable to load current catalog metadata page: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id),
    identityKey: String(row.identity_key ?? row.asset_key),
    assetKey: String(row.asset_key),
    assetType: String(row.asset_type),
    namespace: row.namespace ? String(row.namespace) : null,
    name: String(row.name),
    columns: row.columns,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
  })) satisfies CatalogMetadataAsset[]
}

async function indexCandidates(
  projectId: string,
  candidates: ReturnType<typeof planCatalogMetadataCandidates>['candidates'],
  concurrency: number,
) {
  const boundedConcurrency = Math.max(1, Math.min(8, Math.trunc(concurrency)))
  const results: Array<{ objectType: string; objectKey: string; status: 'INDEXED' | 'FAILED'; error?: string }> = []
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= candidates.length) return
      const candidate = candidates[index]
      try {
        await indexSemanticObject({
          projectId,
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          objectId: candidate.objectId,
          content: candidate.content,
          metadata: candidate.metadata,
        })
        results[index] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: 'INDEXED',
        }
      } catch (error) {
        results[index] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(boundedConcurrency, Math.max(1, candidates.length)) },
    () => worker(),
  ))
  return results
}

export async function indexCatalogMetadataSemanticBatch(input: {
  projectId: string
  cursor?: unknown
  assetBatchSize?: number
  candidateBudget?: number
  concurrency?: number
}) {
  const cursor = normalizeCatalogMetadataCursor(input.cursor)
  const assetBatchSize = boundCatalogMetadataAssetBatch(input.assetBatchSize)
  const admin = createAdminClient()
  const { data: sourceRows, error: sourceError } = await admin.schema('catalog').from('data_sources')
    .select('id')
    .eq('project_id', input.projectId)
    .order('id', { ascending: true })
    .limit(5000)
  if (sourceError) throw new Error(`Unable to enumerate project sources for metadata indexing: ${sourceError.message}`)

  const sourceIds = (sourceRows ?? []).map((row) => String(row.id)).sort()
  const projectSourceIds = new Set(sourceIds)
  if (!sourceIds.length) {
    return {
      projectId: input.projectId,
      complete: true,
      indexed: 0,
      failed: 0,
      candidateCount: 0,
      nextCursor: null,
      results: [],
    }
  }

  let sourceId = cursor.sourceId && projectSourceIds.has(cursor.sourceId)
    ? cursor.sourceId
    : nextSource(sourceIds, cursor.sourceId)

  while (sourceId) {
    const assets: CatalogMetadataAsset[] = []
    const resumesCurrent = cursor.sourceId === sourceId && cursor.fieldOffset > 0
    if (resumesCurrent) {
      const current = await loadCurrentAsset(projectSourceIds, sourceId, cursor.assetKey)
      if (current) assets.push(current)
    }

    const remaining = Math.max(0, assetBatchSize - assets.length)
    const afterAssetKey = cursor.sourceId === sourceId ? cursor.assetKey : ''
    const page = remaining > 0
      ? await loadAssetPage({ sourceId, afterAssetKey, limit: remaining })
      : []
    assets.push(...page)

    if (!assets.length) {
      sourceId = nextSource(sourceIds, sourceId)
      if (sourceId) {
        cursor.sourceId = sourceId
        cursor.assetKey = ''
        cursor.fieldOffset = 0
      }
      continue
    }

    const plan = planCatalogMetadataCandidates({
      assets,
      cursor: cursor.sourceId === sourceId ? cursor : { sourceId, assetKey: '', fieldOffset: 0 },
      candidateBudget: input.candidateBudget,
    })

    const candidates = plan.candidates.map((candidate) => ({
      ...candidate,
      metadata: {
        ...candidate.metadata,
        project_id: input.projectId,
        indexing_authority: 'CURRENT_DISCOVERED_METADATA',
      },
    }))
    const results = await indexCandidates(input.projectId, candidates, input.concurrency ?? 4)
    const failed = results.filter((result) => result.status === 'FAILED').length
    const indexed = results.length - failed

    if (plan.partialAsset) {
      return {
        projectId: input.projectId,
        complete: false,
        indexed,
        failed,
        candidateCount: candidates.length,
        nextCursor: plan.nextCursor,
        results,
      }
    }

    const pageMayContinue = page.length === remaining && remaining > 0
    if (pageMayContinue) {
      return {
        projectId: input.projectId,
        complete: false,
        indexed,
        failed,
        candidateCount: candidates.length,
        nextCursor: plan.nextCursor,
        results,
      }
    }

    const followingSource = nextSource(sourceIds, sourceId)
    return {
      projectId: input.projectId,
      complete: followingSource === null,
      indexed,
      failed,
      candidateCount: candidates.length,
      nextCursor: followingSource
        ? { sourceId: followingSource, assetKey: '', fieldOffset: 0 }
        : null,
      results,
    }
  }

  return {
    projectId: input.projectId,
    complete: true,
    indexed: 0,
    failed: 0,
    candidateCount: 0,
    nextCursor: null,
    results: [],
  }
}
