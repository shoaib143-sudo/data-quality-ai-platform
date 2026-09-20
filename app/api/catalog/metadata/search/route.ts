import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { semanticSearch } from '@/lib/governance/semantic-search'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const query = (url.searchParams.get('q') ?? '').trim()
    const sourceId = (url.searchParams.get('sourceId') ?? '').trim() || null
    const typeParam = (url.searchParams.get('types') ?? 'asset,field')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50)
    const threshold = Number(url.searchParams.get('threshold') ?? 0.35)

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (query.length < 2) return NextResponse.json({ error: 'q must contain at least 2 characters.' }, { status: 400 })
    if (typeParam.some((value) => !['asset', 'field'].includes(value))) {
      return NextResponse.json({ error: 'types may contain only asset and field.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()
    const { data: sources, error: sourceError } = await admin.schema('catalog').from('data_sources')
      .select('id')
      .eq('project_id', projectId)
      .limit(5000)
    if (sourceError) throw new Error(`Unable to resolve searchable catalog sources: ${sourceError.message}`)
    const projectSourceIds = new Set((sources ?? []).map((row) => String(row.id)))
    if (sourceId && !projectSourceIds.has(sourceId)) {
      return NextResponse.json({ error: 'sourceId does not belong to the requested project.' }, { status: 400 })
    }
    if (!projectSourceIds.size) {
      return NextResponse.json({ projectId, query, count: 0, results: [], semantic: { status: 'ENABLED' } })
    }

    const objectTypes = [
      ...(typeParam.includes('asset') ? ['CATALOG_ASSET'] : []),
      ...(typeParam.includes('field') ? ['CATALOG_FIELD'] : []),
    ]
    const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 50))
    const matches = await semanticSearch(admin, {
      projectId,
      query,
      objectTypes,
      threshold: Number.isFinite(threshold) ? threshold : 0.35,
      limit: Math.min(100, sourceId ? Math.max(limit * 3, 50) : limit),
    })

    const matchedAssetIds = [...new Set(matches.flatMap((match) => match.object_id ? [match.object_id] : []))]
    const currentAssets = matchedAssetIds.length
      ? await admin.schema('catalog').from('discovered_assets')
          .select('id,source_id,identity_key,asset_key,asset_type,namespace,name,is_current')
          .in('id', matchedAssetIds)
          .eq('is_current', true)
      : { data: [], error: null }
    if (currentAssets.error) throw new Error(`Unable to validate current catalog search results: ${currentAssets.error.message}`)

    const currentById = new Map(
      (currentAssets.data ?? [])
        .filter((asset) => projectSourceIds.has(String(asset.source_id)))
        .map((asset) => [String(asset.id), asset]),
    )

    const results = matches.flatMap((match) => {
      if (!match.object_id) return []
      const asset = currentById.get(match.object_id)
      if (!asset) return []
      if (sourceId && String(asset.source_id) !== sourceId) return []
      const metadata = match.metadata ?? {}
      const columnName = typeof metadata.column_name === 'string' ? metadata.column_name : null
      return [{
        objectType: match.object_type,
        objectKey: match.object_key,
        assetId: String(asset.id),
        sourceId: String(asset.source_id),
        identityKey: String(asset.identity_key ?? asset.asset_key),
        assetKey: String(asset.asset_key),
        assetType: String(asset.asset_type),
        namespace: asset.namespace ? String(asset.namespace) : null,
        assetName: String(asset.name),
        columnName,
        content: match.content,
        similarity: Number(match.similarity),
        metadata,
      }]
    }).slice(0, limit)

    return NextResponse.json({
      projectId,
      query,
      sourceId,
      count: results.length,
      results,
      semantic: { status: 'ENABLED' },
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    if (error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError') {
      return NextResponse.json({
        error: 'Semantic catalog metadata search is not configured.',
        code: 'SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED',
      }, { status: 503 })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to search catalog metadata.',
    }, { status: 500 })
  }
}
