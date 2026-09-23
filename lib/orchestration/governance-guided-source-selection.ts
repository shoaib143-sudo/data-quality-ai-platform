import { createAdminClient } from '@/lib/supabase/admin'

export type BoundGuidedScope = {
  scopeVersionId: string
  sourceId: string
  scopeHash: string
  qualifiedNames: string[]
  datasetVersionIds: string[]
}

/**
 * Re-resolve the CURRENT enumerated scope at request and approval-resume time.
 * The server never trusts the browser's datasetVersionIds, table list, hash or
 * source ownership. Unbound or unpromoted tables block the whole GUIDED run.
 */
export async function resolveBoundGuidedScope(input: {
  projectId: string
  scopeVersionId: string
}): Promise<BoundGuidedScope> {
  if (!/^[a-f0-9-]{36}$/i.test(input.scopeVersionId)) throw new Error('Choose a valid current source scope for GUIDED.')
  const admin = createAdminClient()
  const { data: scope, error: scopeError } = await admin.schema('catalog').from('source_scopes')
    .select('source_id,current_version_id').eq('project_id', input.projectId)
    .eq('current_version_id', input.scopeVersionId).eq('status', 'ACTIVE').maybeSingle()
  if (scopeError) throw new Error('Unable to resolve current guided source scope.')
  if (!scope) throw new Error('The selected scope is no longer current or is outside this project.')

  const sourceId = String(scope.source_id)
  const [{ data: source, error: sourceError }, { data: version, error: versionError }] = await Promise.all([
    admin.schema('catalog').from('data_sources').select('id,status').eq('id', sourceId)
      .eq('project_id', input.projectId).maybeSingle(),
    admin.schema('catalog').from('source_scope_versions')
      .select('id,source_id,scope_hash,native_selection').eq('id', input.scopeVersionId)
      .eq('source_id', sourceId).eq('project_id', input.projectId).maybeSingle(),
  ])
  if (sourceError || versionError || !source || !version) throw new Error('Current source and scope evidence could not be verified.')
  if (source.status !== 'ACTIVE') throw new Error('The selected source is not active.')
  const selection = version.native_selection && typeof version.native_selection === 'object' && !Array.isArray(version.native_selection)
    ? version.native_selection as Record<string, unknown> : {}
  if (selection.mode !== 'SELECTED' || !Array.isArray(selection.qualifiedNames)) {
    throw new Error('GUIDED requires an explicit list of current selected tables; unbounded source scopes are not eligible.')
  }
  // Exclusion and hierarchy semantics must not be silently ignored.
  if ((Array.isArray(selection.excludedQualifiedNames) && selection.excludedQualifiedNames.length > 0)
    || (Array.isArray(selection.excludedNodeIds) && selection.excludedNodeIds.length > 0)
    || selection.inheritFutureChildren === true
    || (Array.isArray(selection.nodeIds) && selection.nodeIds.length > 0)) {
    throw new Error('GUIDED requires an explicit, non-hierarchical table list without inherited or excluded selections.')
  }
  const names = selection.qualifiedNames.map(value => typeof value === 'string' ? value.trim() : '')
  if (names.length === 0 || names.length > 100 || names.some(name => !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(name))
    || new Set(names).size !== names.length) {
    throw new Error('GUIDED source scope must name 1–100 distinct, fully qualified tables.')
  }
  const scopeHash = String(version.scope_hash ?? '').trim()
  if (!scopeHash) throw new Error('The selected scope has no immutable scope hash.')

  const [{ data: discovered, error: discoveryError }, { data: datasets, error: datasetError }] = await Promise.all([
    admin.schema('catalog').from('discovered_assets').select('asset_key')
      .eq('source_id', sourceId).eq('is_current', true).in('asset_key', names),
    admin.schema('catalog').from('datasets')
      .select('id,source_identifier,status').eq('project_id', input.projectId)
      .eq('data_source_id', sourceId).in('source_identifier', names),
  ])
  if (discoveryError || datasetError) throw new Error('Unable to inspect the exact selected source assets.')
  const present = new Set((discovered ?? []).map(row => String(row.asset_key)))
  const datasetByName = new Map((datasets ?? []).filter(row => row.status === 'ACTIVE')
    .map(row => [String(row.source_identifier), String(row.id)]))
  for (const name of names) {
    if (!present.has(name)) throw new Error('Selected table is not in current discovery evidence: ' + name)
    if (!datasetByName.has(name)) throw new Error('Selected table is not an active governed dataset: ' + name)
  }
  const ids = names.map(name => datasetByName.get(name)!)
  const { data: versions, error: versionsError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,version_number,status').in('dataset_id', ids).order('version_number', { ascending: false })
  if (versionsError) throw new Error('Unable to inspect selected dataset versions.')
  const latest = new Map<string, { id: string; status: string }>()
  for (const row of versions ?? []) if (!latest.has(String(row.dataset_id))) latest.set(String(row.dataset_id), { id: String(row.id), status: String(row.status) })
  const selectedVersions = names.map(name => {
    const row = latest.get(datasetByName.get(name)!)
    if (!row || row.status !== 'AVAILABLE') throw new Error('Selected table has no latest AVAILABLE version: ' + name)
    return row.id
  })
  const { data: bindings, error: bindingError } = await admin.schema('profiling').from('dataset_execution_sources')
    .select('dataset_version_id').eq('active', true).in('dataset_version_id', selectedVersions)
  if (bindingError) throw new Error('Unable to verify current profiling source bindings.')
  const bound = new Set((bindings ?? []).map(row => String(row.dataset_version_id)))
  for (let index = 0; index < names.length; index++) {
    if (!bound.has(selectedVersions[index])) throw new Error('Selected table has no active profiling execution binding: ' + names[index])
  }
  return { scopeVersionId: input.scopeVersionId, sourceId, scopeHash, qualifiedNames: names, datasetVersionIds: selectedVersions }
}

export function sameBoundGuidedScope(expected: BoundGuidedScope, observed: BoundGuidedScope): boolean {
  return expected.scopeVersionId === observed.scopeVersionId && expected.sourceId === observed.sourceId
    && expected.scopeHash === observed.scopeHash
    && JSON.stringify(expected.qualifiedNames) === JSON.stringify(observed.qualifiedNames)
    && JSON.stringify(expected.datasetVersionIds) === JSON.stringify(observed.datasetVersionIds)
}
