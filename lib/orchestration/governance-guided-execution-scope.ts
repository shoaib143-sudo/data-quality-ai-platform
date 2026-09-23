import { createAdminClient } from '@/lib/supabase/admin'

export type FrozenGuidedScope = {
  sourceId: string
  scopeVersionId: string
  qualifiedNames: string[]
  datasetVersionIds: string[]
}

/**
 * Exact-source GUIDED dispatch boundary.
 * Resolve and pin the selected current scope before an approval request is
 * created; re-evaluate it on resume. Never fall back to all project datasets.
 */
export async function resolveFrozenGuidedScope(input: {
  projectId: string
  scopeVersionId: string
}): Promise<FrozenGuidedScope> {
  const admin = createAdminClient()
  if (!input.projectId || !input.scopeVersionId) {
    throw new Error('GUIDED requires an explicit selected source scope version.')
  }
  const { data: scope, error: scopeError } = await admin.schema('catalog').from('source_scope_versions')
    .select('id,source_id,project_id,native_selection')
    .eq('id', input.scopeVersionId).eq('project_id', input.projectId).maybeSingle()
  if (scopeError || !scope) throw new Error('GUIDED source scope version was not found in this project.')
  const sourceId = String(scope.source_id)
  const { data: current, error: currentError } = await admin.schema('catalog').from('source_scopes')
    .select('id').eq('source_id', sourceId).eq('project_id', input.projectId)
    .eq('current_version_id', input.scopeVersionId).eq('status', 'ACTIVE').maybeSingle()
  if (currentError || !current) throw new Error('GUIDED source scope changed or is not active. Review the new version and submit a new run.')
  const selection = scope.native_selection && typeof scope.native_selection === 'object'
    && !Array.isArray(scope.native_selection)
    ? scope.native_selection as Record<string, unknown> : {}
  if (selection.mode !== 'SELECTED' || selection.inheritFutureChildren === true
    || !Array.isArray(selection.qualifiedNames)
    || selection.qualifiedNames.length < 1 || selection.qualifiedNames.length > 100) {
    throw new Error('GUIDED requires a bounded, explicit selection of at most 100 table names.')
  }
  const names = selection.qualifiedNames.map(value => typeof value === 'string' ? value.trim() : '')
  if (names.some(name => !name || name.length > 512) || new Set(names).size !== names.length) {
    throw new Error('GUIDED scope contains an empty, duplicate or invalid qualified table name.')
  }

  const [{ data: assets, error: assetError }, { data: datasets, error: datasetError }] = await Promise.all([
    admin.schema('catalog').from('discovered_assets').select('asset_key').eq('source_id', sourceId)
      .in('asset_key', names).eq('is_current', true),
    admin.schema('catalog').from('datasets').select('id,source_identifier,status')
      .eq('project_id', input.projectId).eq('data_source_id', sourceId).in('source_identifier', names),
  ])
  if (assetError || datasetError) throw new Error('Unable to verify current GUIDED physical assets and datasets.')
  const observed = new Set((assets ?? []).map(row => String(row.asset_key)))
  if (observed.size !== names.length || names.some(name => !observed.has(name))) {
    throw new Error('Some GUIDED scope tables have no current discovery evidence. Refresh Discovery first.')
  }
  const byName = new Map<string,string>()
  for (const row of datasets ?? []) {
    if (row.status !== 'ACTIVE') continue
    const name = String(row.source_identifier ?? '')
    if (byName.has(name)) throw new Error('Ambiguous governed dataset mapping for GUIDED scope.')
    byName.set(name, String(row.id))
  }
  if (byName.size !== names.length || names.some(name => !byName.has(name))) {
    throw new Error('GUIDED scope includes unregistered or inactive datasets. Complete governed promotion first.')
  }

  const { data: versions, error: versionsError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,version_number,status').in('dataset_id', [...byName.values()])
    .order('version_number', { ascending: false })
  if (versionsError) throw new Error('Unable to verify GUIDED dataset versions.')
  const latest = new Map<string, { id: string; status: string }>()
  for (const row of versions ?? []) {
    const datasetId = String(row.dataset_id)
    if (!latest.has(datasetId)) latest.set(datasetId, { id: String(row.id), status: String(row.status) })
  }
  const ids = names.map(name => {
    const row = latest.get(byName.get(name)!)
    if (!row || row.status !== 'AVAILABLE') throw new Error('GUIDED scope has a missing or unavailable latest dataset version.')
    return row.id
  })
  const { data: bindings, error: bindingsError } = await admin.schema('profiling').from('dataset_execution_sources')
    .select('dataset_version_id,active,source_type').in('dataset_version_id', ids).eq('active', true)
  if (bindingsError) throw new Error('Unable to verify GUIDED execution bindings.')
  const activeBindings = new Set((bindings ?? []).filter(row => row.active && row.source_type === 'JDBC').map(row => String(row.dataset_version_id)))
  if (ids.some(id => !activeBindings.has(id))) {
    throw new Error('A GUIDED dataset version is missing its active JDBC execution binding.')
  }
  return { sourceId, scopeVersionId: input.scopeVersionId, qualifiedNames: names, datasetVersionIds: ids }
}

export function assertGuidedScopeUnchanged(
  persisted: { sourceId: string; scopeVersionId: string; datasetVersionIds: readonly string[] },
  current: FrozenGuidedScope,
) {
  if (current.scopeVersionId !== persisted.scopeVersionId || current.sourceId !== persisted.sourceId
    || current.datasetVersionIds.length !== persisted.datasetVersionIds.length
    || current.datasetVersionIds.some((id, index) => id !== persisted.datasetVersionIds[index])) {
    throw new Error('GUIDED source or dataset versions changed after request. Approval is invalidated; submit a new run.')
  }
}
