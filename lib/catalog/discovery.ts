import { createAdminClient } from '@/lib/supabase/admin'
import { discoverJdbcFromNativeHierarchy } from '@/lib/catalog/native-jdbc-discovery'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

type Source = {
  id: string
  project_id: string
  name: string
  source_type: string
  status: string
  connection_metadata: Record<string, unknown> | null
}

type DiscoveredAsset = {
  asset_type: string
  namespace: string | null
  name: string
  columns: unknown[]
  metadata: Record<string, unknown>
}

type DiscoveryResult = {
  assets: DiscoveredAsset[]
  snapshot: Record<string, unknown>
}

type FrozenScope = {
  scopeId: string
  scopeVersionId: string
  versionNumber: number
  scopeHash: string
}

type DiscoveryManifest = {
  expected_object_count: number
  expected_field_count: number
  observed_object_count: number
  observed_field_count: number
  failed_item_count: number
  truncated: boolean
  complete: boolean
  consistency_mode: string
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function inferType(value: unknown) {
  if (value === null || value === undefined) return 'unknown'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'datetime'
  return typeof value
}

function assetKey(asset: DiscoveredAsset) {
  return `${asset.namespace ?? ''}.${asset.name}`.toLowerCase()
}

function fieldCount(assets: DiscoveredAsset[]) {
  return assets.reduce((total, asset) => total + asset.columns.length, 0)
}

async function resolveSourceLocation(source: Source) {
  const admin = createAdminClient()
  const metadata = record(source.connection_metadata)
  const explicit = stringField(metadata, ['source_uri', 'sourceUri', 'url', 'path', 'file'])
  if (explicit && (/^https?:\/\//i.test(explicit) || explicit.includes('/'))) return { sourceUri: explicit, executionConfig: metadata }

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,source_identifier').eq('data_source_id', source.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve FILE source dataset: ${datasetError.message}`)
  if (!dataset) return null

  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,source_uri').eq('dataset_id', dataset.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
  if (versionError) throw new Error(`Unable to resolve FILE source version: ${versionError.message}`)
  if (version) {
    const { data: execution, error: executionError } = await admin.schema('profiling').from('dataset_execution_sources').select('source_uri,execution_config').eq('dataset_version_id', version.id).eq('active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (executionError) throw new Error(`Unable to resolve FILE execution source: ${executionError.message}`)
    if (execution?.source_uri) return { sourceUri: execution.source_uri, executionConfig: { ...metadata, ...record(execution.execution_config) } }
    if (version.source_uri) return { sourceUri: version.source_uri, executionConfig: metadata }
  }
  if (dataset.source_identifier) return { sourceUri: dataset.source_identifier, executionConfig: metadata }
  return null
}

async function discoverFile(source: Source): Promise<DiscoveryResult> {
  const location = await resolveSourceLocation(source)
  if (!location) throw new Error('FILE source has no executable URL, Supabase Storage path, or registered dataset execution location.')
  const admin = createAdminClient()
  const loaded = await loadFileSource(admin, location, { maxRows: 1 })
  const columnNames = Array.from(loaded.rows.reduce<Set<string>>((names, row) => {
    Object.keys(row).forEach((name) => names.add(name))
    return names
  }, new Set()))
  const columns = columnNames.map((name) => {
    const sample = loaded.rows.find((row) => row[name] !== null && row[name] !== undefined)?.[name]
    return { name, type: inferType(sample) }
  })
  const name = String(loaded.metadata.file_name ?? source.name)
  const asset: DiscoveredAsset = {
    asset_type: loaded.format === 'binary' ? 'FILE_METADATA' : 'FILE',
    namespace: null,
    name,
    columns,
    metadata: {
      ...loaded.metadata,
      format: loaded.format,
      content_type: loaded.contentType,
      // Row-level values are not persisted by discovery. Profiling/classification have
      // their own permissions and execution boundaries.
      discovery_content_access: 'SCHEMA_INFERENCE_ONLY',
      warnings: loaded.warnings,
    },
  }
  const manifest: DiscoveryManifest = {
    expected_object_count: 1,
    expected_field_count: columns.length,
    observed_object_count: 1,
    observed_field_count: columns.length,
    failed_item_count: 0,
    truncated: false,
    complete: true,
    consistency_mode: 'BEST_EFFORT_RECONCILIATION',
  }
  return {
    assets: [asset],
    snapshot: {
      source_type: source.source_type,
      source_uri: loaded.sourceUri,
      format: loaded.format,
      content_type: loaded.contentType,
      asset_count: 1,
      metadata: loaded.metadata,
      warnings: loaded.warnings,
      discovery_manifest: manifest,
      consistency_mode: manifest.consistency_mode,
    },
  }
}

function manifestFromResult(result: DiscoveryResult): DiscoveryManifest {
  const snapshot = record(result.snapshot)
  const supplied = record(snapshot.discovery_manifest)
  const observedObjects = result.assets.length
  const observedFields = fieldCount(result.assets)
  const expectedObjects = integer(supplied.expected_object_count, integer(snapshot.scoped_object_count, observedObjects))
  const expectedFields = integer(supplied.expected_field_count, integer(snapshot.scoped_field_count, observedFields))
  const failed = integer(supplied.failed_item_count, 0)
  const truncated = supplied.truncated === true || snapshot.discovery_truncated === true
  const duplicateKeys = observedObjects - new Set(result.assets.map(assetKey)).size
  const complete = supplied.complete !== false
    && !truncated
    && failed === 0
    && duplicateKeys === 0
    && expectedObjects === observedObjects
    && expectedFields === observedFields
  return {
    expected_object_count: expectedObjects,
    expected_field_count: expectedFields,
    observed_object_count: observedObjects,
    observed_field_count: observedFields,
    failed_item_count: failed + Math.max(0, duplicateKeys),
    truncated,
    complete,
    consistency_mode: stringField(supplied, ['consistency_mode']) ?? stringField(snapshot, ['consistency_mode']) ?? 'BEST_EFFORT_RECONCILIATION',
  }
}

async function freezeDiscoveryScope(source: Source, actorUserId?: string | null): Promise<FrozenScope> {
  const admin = createAdminClient()
  const metadata = record(source.connection_metadata)
  const nativeSelection = metadata.hierarchy_selection ?? { mode: 'ALL', nodeIds: [], qualifiedNames: [] }
  const { data, error } = await admin.schema('catalog').rpc('ensure_source_scope_version', {
    p_project_id: source.project_id,
    p_source_id: source.id,
    p_native_selection: nativeSelection,
    p_actor: actorUserId?.trim() || null,
  })
  if (error) throw new Error(`Unable to freeze discovery scope: ${error.message}`)
  const result = record(data)
  const scopeId = stringField(result, ['scope_id'])
  const scopeVersionId = stringField(result, ['scope_version_id'])
  if (!scopeId || !scopeVersionId) throw new Error('Unable to freeze discovery scope: no scope identity returned.')
  return {
    scopeId,
    scopeVersionId,
    versionNumber: integer(result.version_number, 1),
    scopeHash: stringField(result, ['scope_hash']) ?? '',
  }
}

async function markIncomplete(runId: string, manifest: DiscoveryManifest, message: string) {
  const admin = createAdminClient()
  await admin.schema('catalog').from('discovery_runs').update({
    status: 'INCOMPLETE',
    error_message: message,
    schema_snapshot: { discovery_manifest: manifest, publication: { published: false, reason: 'INCOMPLETE_SCAN' } },
    observed_to: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).eq('id', runId)
}

export async function executeMetadataDiscovery(sourceId: string, actorUserId?: string | null) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status,connection_metadata').eq('id', sourceId).maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve discovery source: ${sourceError?.message ?? 'not found'}`)
  if (!['ACTIVE', 'CONFIGURED'].includes(String(source.status).toUpperCase())) throw new Error('Source must be ACTIVE or CONFIGURED before metadata discovery.')

  const typedSource = source as Source
  const frozenScope = await freezeDiscoveryScope(typedSource, actorUserId)
  const observedFrom = new Date().toISOString()
  const { data: run, error: runError } = await admin.schema('catalog').from('discovery_runs').insert({
    project_id: source.project_id,
    source_id: source.id,
    status: 'RUNNING',
    scope_id: frozenScope.scopeId,
    scope_version_id: frozenScope.scopeVersionId,
    observed_from: observedFrom,
    consistency_mode: 'BEST_EFFORT_RECONCILIATION',
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create metadata discovery run: ${runError?.message ?? 'unknown error'}`)

  try {
    const sourceType = String(source.source_type).toUpperCase()
    let result: DiscoveryResult
    if (sourceType === 'JDBC') {
      result = await discoverJdbcFromNativeHierarchy(record(source.connection_metadata))
    } else if (['FILE', 'CSV'].includes(sourceType)) {
      result = await discoverFile(typedSource)
    } else {
      throw new Error(`No metadata discovery adapter is registered for source type ${sourceType}.`)
    }

    const manifest = manifestFromResult(result)
    const observedTo = new Date().toISOString()
    if (!manifest.complete) {
      const message = `Metadata discovery is incomplete: observed ${manifest.observed_object_count}/${manifest.expected_object_count} required objects and ${manifest.observed_field_count}/${manifest.expected_field_count} required fields; ${manifest.failed_item_count} failures; truncated=${manifest.truncated}. No catalog revision was published.`
      await markIncomplete(run.id, manifest, message)
      throw new Error(message)
    }

    const { data: publicationData, error: publicationError } = await admin.schema('catalog').rpc('publish_discovery_revision', {
      p_run_id: run.id,
      p_source_id: source.id,
      p_scope_id: frozenScope.scopeId,
      p_scope_version_id: frozenScope.scopeVersionId,
      p_manifest: manifest,
      p_assets: result.assets,
      p_observed_from: observedFrom,
      p_observed_to: observedTo,
      p_consistency_mode: manifest.consistency_mode,
    })
    if (publicationError) throw new Error(`Atomic catalog publication failed: ${publicationError.message}`)

    const publication = record(publicationData)
    const finalSnapshot = {
      ...result.snapshot,
      discovery_manifest: manifest,
      frozen_scope: {
        scope_id: frozenScope.scopeId,
        scope_version_id: frozenScope.scopeVersionId,
        scope_version_number: frozenScope.versionNumber,
        scope_hash: frozenScope.scopeHash,
      },
      publication: {
        published: true,
        revision_id: publication.revision_id ?? null,
        revision_number: publication.revision_number ?? null,
        manifest_id: publication.manifest_id ?? null,
        objects_observed: publication.objects_observed ?? manifest.observed_object_count,
        objects_added: publication.objects_added ?? 0,
        objects_changed: publication.objects_changed ?? 0,
        objects_missing: publication.objects_missing ?? 0,
        objects_removed: publication.objects_removed ?? 0,
        objects_unchanged: publication.objects_unchanged ?? 0,
        manifest_hash: publication.manifest_hash ?? null,
        change_set_hash: publication.change_set_hash ?? null,
      },
      enrichments: {
        lineage: 'DEFERRED',
        ai_semantics: 'DEFERRED',
        classification: 'DEFERRED',
        glossary_matching: 'DEFERRED',
      },
    }

    // Publication is already committed atomically by the RPC. Snapshot enrichment is
    // deliberately best-effort and must never invalidate a trusted published revision.
    const { error: snapshotError } = await admin.schema('catalog').from('discovery_runs').update({
      schema_snapshot: finalSnapshot,
      error_message: null,
    }).eq('id', run.id)
    if (snapshotError) console.error('[metadata-discovery-snapshot]', snapshotError.message)

    return {
      discoveryRunId: run.id,
      sourceId: source.id,
      scopeId: frozenScope.scopeId,
      scopeVersionId: frozenScope.scopeVersionId,
      catalogRevisionId: stringField(publication, ['revision_id']),
      catalogRevisionNumber: integer(publication.revision_number, 0),
      objectsObserved: integer(publication.objects_observed, manifest.observed_object_count),
      objectsAdded: integer(publication.objects_added, 0),
      objectsChanged: integer(publication.objects_changed, 0),
      objectsMissing: integer(publication.objects_missing, 0),
      objectsRemoved: integer(publication.objects_removed, 0),
      objectsUnchanged: integer(publication.objects_unchanged, 0),
      consistencyMode: manifest.consistency_mode,
      snapshot: finalSnapshot,
    }
  } catch (error) {
    const { data: currentRun } = await admin.schema('catalog').from('discovery_runs').select('status,catalog_revision_id').eq('id', run.id).maybeSingle()
    const alreadyPublished = currentRun?.status === 'COMPLETED' && Boolean(currentRun.catalog_revision_id)
    if (!alreadyPublished && currentRun?.status !== 'INCOMPLETE') {
      await admin.schema('catalog').from('discovery_runs').update({
        status: 'FAILED',
        error_message: error instanceof Error ? error.message : 'Metadata discovery failed.',
        observed_to: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)
    }
    throw error
  }
}
