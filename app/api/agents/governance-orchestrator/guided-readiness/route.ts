import { NextResponse } from 'next/server'

import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  assessGuidedReadiness,
  type GuidedSourceScope,
  type GuidedDataset,
  type GuidedDatasetVersion,
  type GuidedExecutionSource,
  type GuidedDiscoveredAsset,
} from '@/lib/orchestration/governance-guided-readiness'

/**
 * A signed-in user's read-only, project-scoped onboarding preflight.
 * Never reads/returns JDBC credentials, service secrets or raw source rows.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'Choose a project to check its source readiness.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')
    const admin = createAdminClient()
    const { data: sources, error: sourcesError } = await admin.schema('catalog').from('data_sources')
      .select('id,name').eq('project_id', projectId).eq('status', 'ACTIVE').limit(100)
    if (sourcesError) throw new Error('Unable to read project sources.')
    if ((sources ?? []).length >= 100) throw new Error('Too many sources for this bounded preflight. Narrow the project scope.')
    const ids = (sources ?? []).map(row => String(row.id))
    if (!ids.length) return NextResponse.json(assessGuidedReadiness({
      scopes: [], datasets: [], versions: [], executionSources: [], discoveredAssets: [],
    }), { headers: { 'Cache-Control': 'no-store' } })

    const { data: currentScopes, error: scopeError } = await admin.schema('catalog').from('source_scopes')
      .select('source_id,current_version_id').in('source_id', ids).eq('status', 'ACTIVE')
    if (scopeError) throw new Error('Unable to read the current source scope.')
    const versionIds = (currentScopes ?? []).map(row => row.current_version_id).filter((id): id is string => Boolean(id))
    const { data: scopeVersions, error: scopeVersionError } = versionIds.length
      ? await admin.schema('catalog').from('source_scope_versions')
          .select('id,source_id,version_number,native_selection').in('id', versionIds)
      : { data: [], error: null }
    if (scopeVersionError) throw new Error('Unable to read the selected source scope version.')
    const sourceNames = new Map((sources ?? []).map(row => [String(row.id), String(row.name)]))
    const scopes: GuidedSourceScope[] = (scopeVersions ?? []).map(row => {
      const selected = row.native_selection && typeof row.native_selection === 'object'
        && !Array.isArray(row.native_selection) ? row.native_selection as Record<string, unknown> : {}
      return {
        sourceId: String(row.source_id),
        sourceName: sourceNames.get(String(row.source_id)) ?? 'Unnamed source',
        versionNumber: Number(row.version_number),
        mode: String(selected.mode ?? 'ALL'),
        qualifiedNames: Array.isArray(selected.qualifiedNames)
          ? selected.qualifiedNames.filter((name): name is string => typeof name === 'string') : [],
      }
    })
    const qualifiedNames = [...new Set(scopes.flatMap(scope => scope.mode === 'SELECTED' ? scope.qualifiedNames : []))]
    const selectedSourceIds = [...new Set(scopes.map(scope => scope.sourceId))]
    const [{ data: rows, error: datasetError }, { data: discovered, error: discoveredError }] = await Promise.all([
      admin.schema('catalog').from('datasets')
        .select('id,data_source_id,source_identifier,status').eq('project_id', projectId).in('data_source_id', selectedSourceIds),
      qualifiedNames.length
        ? admin.schema('catalog').from('discovered_assets')
          .select('source_id,asset_key,is_current').in('source_id', selectedSourceIds).in('asset_key', qualifiedNames).eq('is_current', true)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (datasetError || discoveredError) throw new Error('Unable to verify the selected source assets.')
    const datasets: GuidedDataset[] = (rows ?? []).map(row => ({
      id: String(row.id), dataSourceId: String(row.data_source_id),
      sourceIdentifier: row.source_identifier ? String(row.source_identifier) : null,
      status: String(row.status),
    }))
    const datasetIds = datasets.map(row => row.id)
    const { data: rowsVersions, error: versionsError } = datasetIds.length
      ? await admin.schema('catalog').from('dataset_versions')
          .select('id,dataset_id,version_number,status').in('dataset_id', datasetIds)
      : { data: [], error: null }
    if (versionsError) throw new Error('Unable to verify dataset versions.')
    const versions: GuidedDatasetVersion[] = (rowsVersions ?? []).map(row => ({
      id: String(row.id), datasetId: String(row.dataset_id),
      versionNumber: Number(row.version_number), status: String(row.status),
    }))
    const { data: bindings, error: bindingsError } = versions.length
      ? await admin.schema('profiling').from('dataset_execution_sources')
          .select('dataset_version_id,active').in('dataset_version_id', versions.map(row => row.id))
      : { data: [], error: null }
    if (bindingsError) throw new Error('Unable to verify profiling execution bindings.')
    const result = assessGuidedReadiness({
      scopes,
      datasets,
      versions,
      executionSources: (bindings ?? []).map(row => ({
        datasetVersionId: String(row.dataset_version_id), active: row.active === true,
      })) as GuidedExecutionSource[],
      discoveredAssets: (discovered ?? []).map(row => ({
        sourceId: String(row.source_id), assetKey: String(row.asset_key), isCurrent: row.is_current === true,
      })) as GuidedDiscoveredAsset[],
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Guided source readiness could not be verified.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
