import { NextResponse } from 'next/server'

import { authorizeProject, authorizationErrorResponse, hasProjectCapability } from '@/lib/auth/authorize'
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
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const requestedSourceId = url.searchParams.get('sourceId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'Choose a project to check its source readiness.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')
    const admin = createAdminClient()
    const { data: sources, error: sourcesError } = await admin.schema('catalog').from('data_sources')
      .select('id,name').eq('project_id', projectId).eq('status', 'ACTIVE').limit(100)
    if (sourcesError) throw new Error('Unable to read project sources.')
    if ((sources ?? []).length >= 100) throw new Error('Too many sources for this bounded preflight. Narrow the project scope.')
    const sourceOptions = (sources ?? []).map(row => ({ id: String(row.id), name: String(row.name) }))
    const ids = sourceOptions.map(row => row.id)
    if (requestedSourceId && !ids.includes(requestedSourceId)) return NextResponse.json({ error: 'Selected source does not belong to this active project.' }, { status: 404 })
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
        scopeVersionId: String(row.id),
        versionNumber: Number(row.version_number),
        mode: String(selected.mode ?? 'ALL'),
        qualifiedNames: Array.isArray(selected.qualifiedNames)
          ? selected.qualifiedNames.filter((name): name is string => typeof name === 'string') : [],
      }
    })
    // Select ONE source. Other active project sources (many are unbounded ALL) must never
    // contribute datasets to this GUIDED test or make an unrelated scope fail preflight.
    const selectedSourceId = requestedSourceId // Never default to PUB Gold or any other source.
    const selectedScopes = scopes.filter(scope => scope.sourceId === selectedSourceId)
    const qualifiedNames = [...new Set(selectedScopes.flatMap(scope => scope.mode === 'SELECTED' ? scope.qualifiedNames : []))]
    const selectedSourceIds = selectedScopes.map(scope => scope.sourceId)
    if (!selectedSourceIds.length) return NextResponse.json({
      ...assessGuidedReadiness({ scopes: [], datasets: [], versions: [], executionSources: [], discoveredAssets: [] }),
      selectedSourceId, sourceOptions,
    }, { headers: { 'Cache-Control': 'no-store' } })
    const selectedScopeVersionIds = selectedScopes
      .map(scope => scope.scopeVersionId)
      .filter((id): id is string => Boolean(id))
    const [
      { data: rows, error: datasetError },
      { data: discovered, error: discoveredError },
      { data: discoveryRun, error: discoveryRunError },
      { data: latestDiscoveryAttempt, error: latestDiscoveryAttemptError },
      { data: activeRoleBindings, error: roleBindingsError },
      operatorCanExecute,
      operatorCanRunDiscovery,
    ] = await Promise.all([
      admin.schema('catalog').from('datasets')
        .select('id,data_source_id,source_identifier,status').eq('project_id', projectId).in('data_source_id', selectedSourceIds),
      qualifiedNames.length
        ? admin.schema('catalog').from('discovered_assets')
          .select('source_id,asset_key,is_current').in('source_id', selectedSourceIds).in('asset_key', qualifiedNames).eq('is_current', true)
        : Promise.resolve({ data: [], error: null }),
      selectedScopeVersionIds.length
        ? admin.schema('catalog').from('discovery_runs')
          .select('id,status,scope_version_id,completed_at,error_message,objects_observed,objects_missing')
          .eq('project_id', projectId)
          .eq('source_id', selectedSourceId)
          .in('scope_version_id', selectedScopeVersionIds)
          .eq('status', 'COMPLETED')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      selectedScopeVersionIds.length
        ? admin.schema('catalog').from('discovery_runs')
          .select('id,status,scope_version_id,started_at,completed_at,error_message')
          .eq('project_id', projectId)
          .eq('source_id', selectedSourceId)
          .in('scope_version_id', selectedScopeVersionIds)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.schema('governance').from('project_role_bindings')
        .select('user_id,role_key').eq('project_id', projectId).eq('active', true).limit(1000),
      hasProjectCapability(user.id, projectId, 'agent.execute'),
      hasProjectCapability(user.id, projectId, 'discovery.execute'),
    ])
    if (datasetError || discoveredError) throw new Error('Unable to verify the selected source assets.')
    if (discoveryRunError) throw new Error('Unable to verify current-scope discovery evidence.')
    if (latestDiscoveryAttemptError) throw new Error('Unable to verify the latest discovery attempt.')
    if (roleBindingsError) throw new Error('Unable to verify active project role bindings.')
    if ((activeRoleBindings ?? []).length >= 1000) throw new Error('Too many active project role bindings for this bounded preflight.')
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
    // Catalog registrations and bindings are insufficient: current scope discovery
    // must also have genuine successful, complete evidence before a guided run.
    const selectedVersions = versions.filter(version => datasets.some(dataset => dataset.id === version.datasetId)
      && selectedScopes.some(scope => scope.qualifiedNames.some(name => datasets.some(dataset =>
        dataset.id === version.datasetId && dataset.sourceIdentifier === name))))
    const profileReadiness = await Promise.all(selectedVersions.map(async version => {
      const { data, error } = await admin.schema('catalog').rpc('verify_dataset_version_profile_readiness', {
        p_project_id: projectId, p_dataset_version_id: version.id,
      })
      if (error) throw new Error('Unable to verify authoritative profile readiness.')
      const report = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {}
      const blockers = report.blockers && typeof report.blockers === 'object' && !Array.isArray(report.blockers)
        ? Object.entries(report.blockers as Record<string, unknown>).filter(([, active]) => active === true).map(([key]) => key) : []
      return { datasetVersionId: version.id, ready: report.profiling_ready === true, blockerCodes: blockers }
    }))
    const result = assessGuidedReadiness({
      scopes: selectedScopes,
      datasets,
      versions,
      executionSources: (bindings ?? []).map(row => ({
        datasetVersionId: String(row.dataset_version_id), active: row.active === true,
      })) as GuidedExecutionSource[],
      profileReadiness,
      discoveredAssets: (discovered ?? []).map(row => ({
        sourceId: String(row.source_id), assetKey: String(row.asset_key), isCurrent: row.is_current === true,
      })) as GuidedDiscoveredAsset[],
    })
    const expectedObjects = qualifiedNames.length
    const observedObjects = Number(discoveryRun?.objects_observed ?? 0)
    const missingObjects = Number(discoveryRun?.objects_missing ?? 0)
    const currentScopeDiscoveryReady = Boolean(
      discoveryRun
      && !discoveryRun.error_message
      && observedObjects >= expectedObjects
      && missingObjects === 0
      && selectedScopeVersionIds.includes(String(discoveryRun.scope_version_id ?? '')),
    )
    const latestDiscoveryErrorMessage = typeof latestDiscoveryAttempt?.error_message === 'string'
      ? latestDiscoveryAttempt.error_message
      : ''
    const latestDiscoveryErrorCode = !latestDiscoveryErrorMessage
      ? null
      : /invalid access token/i.test(latestDiscoveryErrorMessage)
        ? 'INVALID_CREDENTIAL'
        : /credential|token|unauthoriz|forbidden/i.test(latestDiscoveryErrorMessage)
          ? 'CREDENTIAL_OR_AUTH'
          : /timeout|timed out/i.test(latestDiscoveryErrorMessage)
            ? 'UPSTREAM_TIMEOUT'
            : 'UPSTREAM_DISCOVERY_FAILED'
    const activeParticipants = new Set((activeRoleBindings ?? []).map(row => String(row.user_id)))
    const roleCounts = (activeRoleBindings ?? []).reduce<Record<string, number>>((counts, row) => {
      const role = String(row.role_key ?? 'UNKNOWN')
      counts[role] = (counts[role] ?? 0) + 1
      return counts
    }, {})
    const preflightBlockerCodes = [
      ...(!currentScopeDiscoveryReady ? ['CURRENT_SCOPE_DISCOVERY_EVIDENCE_MISSING'] : []),
      ...(latestDiscoveryErrorCode === 'INVALID_CREDENTIAL' ? ['DISCOVERY_INVALID_CREDENTIAL'] : []),
      ...(!operatorCanExecute ? ['OPERATOR_AGENT_EXECUTE_MISSING'] : []),
      ...(activeParticipants.size === 0 ? ['PROJECT_ROLE_BINDINGS_MISSING'] : []),
      ...(!result.ready ? ['SELECTED_TABLES_NOT_READY'] : []),
    ]
    return NextResponse.json({
      ...result,
      selectedSourceId,
      sourceOptions,
      e2eReady: result.ready && preflightBlockerCodes.length === 0,
      preflightBlockerCodes,
      currentScopeDiscovery: {
        ready: currentScopeDiscoveryReady,
        expectedObjects,
        latestAttempt: latestDiscoveryAttempt ? {
          id: String(latestDiscoveryAttempt.id),
          status: String(latestDiscoveryAttempt.status),
          scopeVersionId: String(latestDiscoveryAttempt.scope_version_id),
          startedAt: latestDiscoveryAttempt.started_at ? String(latestDiscoveryAttempt.started_at) : null,
          completedAt: latestDiscoveryAttempt.completed_at ? String(latestDiscoveryAttempt.completed_at) : null,
          errorCode: latestDiscoveryErrorCode,
        } : null,
        latestRun: discoveryRun ? {
          id: String(discoveryRun.id),
          scopeVersionId: String(discoveryRun.scope_version_id),
          completedAt: discoveryRun.completed_at ? String(discoveryRun.completed_at) : null,
          objectsObserved: observedObjects,
          objectsMissing: missingObjects,
        } : null,
      },
      participantReadiness: {
        ready: activeParticipants.size > 0,
        activeBindingCount: (activeRoleBindings ?? []).length,
        activeParticipantCount: activeParticipants.size,
        roleCounts,
      },
      operatorCapabilities: {
        agentExecute: operatorCanExecute,
        discoveryExecute: operatorCanRunDiscovery,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Guided source readiness could not be verified.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
