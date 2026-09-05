import { createAdminClient } from '@/lib/supabase/admin'
import { discoverJdbcFromNativeHierarchy, type NativeDiscoveryCheckpointAdapter } from '@/lib/catalog/native-jdbc-discovery'
import { discoverFileMetadata } from '@/lib/catalog/file-metadata-discovery'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

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
  nativeSelection: unknown
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

type DiscoveryRunIdentity = {
  id: string
  observedFrom: string
  frozenScope: FrozenScope
  alreadyPublished: boolean
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

function assetKey(asset: DiscoveredAsset) {
  return `${asset.namespace ?? ''}.${asset.name}`.toLowerCase()
}

function assetIdentityKey(asset: DiscoveredAsset) {
  const native = record(record(asset.metadata).native_identity)
  const nativeId = stringField(native, ['id'])
  if (nativeId && native.immutable === true) {
    const provider = (stringField(native, ['provider']) ?? stringField(record(asset.metadata), ['database_product']) ?? 'provider').toLowerCase()
    const kind = (stringField(native, ['kind']) ?? 'object').toLowerCase()
    return `native:${provider}:${kind}:${nativeId.toLowerCase()}`
  }
  return `qualified:${assetKey(asset)}`
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
  const result = await discoverFileMetadata(admin, location, source.source_type)
  return { assets: [result.asset], snapshot: result.snapshot }
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
  const duplicateKeys = observedObjects - new Set(result.assets.map(assetIdentityKey)).size
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

async function loadScopeVersion(scopeVersionId: string): Promise<FrozenScope> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').from('source_scope_versions').select('id,scope_id,version_number,scope_hash,native_selection').eq('id', scopeVersionId).maybeSingle()
  if (error || !data) throw new Error(`Unable to load frozen discovery scope: ${error?.message ?? 'not found'}`)
  return {
    scopeId: data.scope_id,
    scopeVersionId: data.id,
    versionNumber: integer(data.version_number, 1),
    scopeHash: String(data.scope_hash ?? ''),
    nativeSelection: data.native_selection ?? { mode: 'ALL', nodeIds: [], qualifiedNames: [] },
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
  const scopeVersionId = stringField(result, ['scope_version_id'])
  if (!scopeVersionId) throw new Error('Unable to freeze discovery scope: no scope version identity returned.')
  return loadScopeVersion(scopeVersionId)
}

async function loadOrCreateRun(source: Source, actorUserId?: string | null, durableJobId?: string | null): Promise<DiscoveryRunIdentity> {
  const admin = createAdminClient()
  const normalizedJobId = durableJobId?.trim() || null
  if (normalizedJobId) {
    const { data: existing, error } = await admin.schema('catalog').from('discovery_runs').select('id,status,observed_from,scope_version_id,catalog_revision_id').eq('durable_job_id', normalizedJobId).maybeSingle()
    if (error) throw new Error(`Unable to resume metadata discovery: ${error.message}`)
    if (existing?.scope_version_id) {
      const frozenScope = await loadScopeVersion(existing.scope_version_id)
      if (existing.status === 'COMPLETED' && existing.catalog_revision_id) {
        return { id: existing.id, observedFrom: existing.observed_from ?? new Date().toISOString(), frozenScope, alreadyPublished: true }
      }
      const observedFrom = existing.observed_from ?? new Date().toISOString()
      const { error: resumeError } = await admin.schema('catalog').from('discovery_runs').update({
        status: 'RUNNING',
        error_message: null,
        completed_at: null,
        observed_to: null,
      }).eq('id', existing.id)
      if (resumeError) throw new Error(`Unable to resume metadata discovery run: ${resumeError.message}`)
      return { id: existing.id, observedFrom, frozenScope, alreadyPublished: false }
    }
  }

  const frozenScope = await freezeDiscoveryScope(source, actorUserId)
  const observedFrom = new Date().toISOString()
  const { data: run, error: runError } = await admin.schema('catalog').from('discovery_runs').insert({
    project_id: source.project_id,
    source_id: source.id,
    status: 'RUNNING',
    scope_id: frozenScope.scopeId,
    scope_version_id: frozenScope.scopeVersionId,
    observed_from: observedFrom,
    consistency_mode: 'BEST_EFFORT_RECONCILIATION',
    durable_job_id: normalizedJobId,
  }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create metadata discovery run: ${runError?.message ?? 'unknown error'}`)
  return { id: run.id, observedFrom, frozenScope, alreadyPublished: false }
}

function checkpointAdapter(runId: string): NativeDiscoveryCheckpointAdapter {
  const admin = createAdminClient()
  return {
    async load(partitionKey) {
      const { data: checkpoint, error } = await admin.schema('catalog').from('discovery_checkpoints').select('status,provider_cursor').eq('discovery_run_id', runId).eq('partition_key', partitionKey).maybeSingle()
      if (error) throw new Error(`Unable to load discovery checkpoint ${partitionKey}: ${error.message}`)
      if (!checkpoint || checkpoint.status !== 'COMPLETED') return null
      const snapshot = record(checkpoint.provider_cursor)
      if (snapshot.discovery_truncated === true || integer(snapshot.failed_item_count, 0) > 0) return null
      const { data: staged, error: stagedError } = await admin.schema('catalog').from('discovery_staging_assets').select('payload').eq('discovery_run_id', runId).eq('partition_key', partitionKey).order('asset_key')
      if (stagedError) throw new Error(`Unable to load staged discovery partition ${partitionKey}: ${stagedError.message}`)
      return {
        assets: (staged ?? []).map(row => row.payload as DiscoveredAsset),
        snapshot,
      }
    },
    async save(partitionKey, assets, snapshot) {
      const { data: existing } = await admin.schema('catalog').from('discovery_checkpoints').select('attempt').eq('discovery_run_id', runId).eq('partition_key', partitionKey).maybeSingle()
      const attempt = integer(existing?.attempt, 0) + 1
      const { error: startError } = await admin.schema('catalog').from('discovery_checkpoints').upsert({
        discovery_run_id: runId,
        partition_key: partitionKey,
        status: 'RUNNING',
        provider_cursor: snapshot,
        attempt,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      }, { onConflict: 'discovery_run_id,partition_key' })
      if (startError) throw new Error(`Unable to start discovery checkpoint ${partitionKey}: ${startError.message}`)

      const { error: clearError } = await admin.schema('catalog').from('discovery_staging_assets').delete().eq('discovery_run_id', runId).eq('partition_key', partitionKey)
      if (clearError) throw new Error(`Unable to refresh staged discovery partition ${partitionKey}: ${clearError.message}`)
      if (assets.length) {
        const { error: stageError } = await admin.schema('catalog').from('discovery_staging_assets').insert(assets.map(asset => ({
          discovery_run_id: runId,
          partition_key: partitionKey,
          identity_key: assetIdentityKey(asset),
          asset_key: assetKey(asset),
          payload: asset,
        })))
        if (stageError) throw new Error(`Unable to stage discovery partition ${partitionKey}: ${stageError.message}`)
      }
      const usable = snapshot.discovery_truncated !== true && integer(snapshot.failed_item_count, 0) === 0
      const { error: completeError } = await admin.schema('catalog').from('discovery_checkpoints').update({
        status: usable ? 'COMPLETED' : 'FAILED',
        provider_cursor: snapshot,
        updated_at: new Date().toISOString(),
      }).eq('discovery_run_id', runId).eq('partition_key', partitionKey)
      if (completeError) throw new Error(`Unable to finalize discovery checkpoint ${partitionKey}: ${completeError.message}`)
    },
  }
}

async function persistConnectorCapabilities(source: Source, snapshot: Record<string, unknown>) {
  const capabilities = record(snapshot.connector_capabilities)
  if (!Object.keys(capabilities).length) return
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.schema('catalog').from('source_discovery_capabilities').upsert({
    source_id: source.id,
    project_id: source.project_id,
    capabilities,
    discovered_at: now,
    updated_at: now,
  }, { onConflict: 'source_id' })
  if (error) console.error('[metadata-discovery-capabilities]', error.message)
}

async function markIncomplete(runId: string, manifest: DiscoveryManifest, message: string, snapshot: Record<string, unknown>) {
  const admin = createAdminClient()
  await admin.schema('catalog').from('discovery_runs').update({
    status: 'INCOMPLETE',
    error_message: message,
    schema_snapshot: { ...snapshot, discovery_manifest: manifest, publication: { published: false, reason: 'INCOMPLETE_SCAN' } },
    observed_to: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).eq('id', runId)
}

async function queueLineageEnrichment(input: {
  source: Source
  discoveryRunId: string
  catalogRevisionId: string | null
  actorUserId?: string | null
}) {
  if (String(input.source.source_type).toUpperCase() !== 'JDBC') {
    return { status: 'NOT_APPLICABLE', job_id: null, error: null }
  }
  if (!input.catalogRevisionId) {
    return { status: 'NOT_QUEUED', job_id: null, error: 'Catalog revision identity is unavailable.' }
  }
  try {
    const job = await enqueueDurableJob({
      projectId: input.source.project_id,
      jobType: 'LINEAGE_ENRICHMENT',
      entityId: input.source.id,
      idempotencyKey: `lineage-enrichment:${input.catalogRevisionId}`,
      payload: {
        sourceId: input.source.id,
        discoveryRunId: input.discoveryRunId,
        catalogRevisionId: input.catalogRevisionId,
        userId: input.actorUserId?.trim() || null,
      },
      priority: 120,
      maxAttempts: 3,
    })
    return { status: 'QUEUED', job_id: job.id, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue lineage enrichment.'
    console.error('[metadata-discovery-lineage-queue]', message)
    return { status: 'QUEUE_FAILED', job_id: null, error: message }
  }
}

export async function executeMetadataDiscovery(sourceId: string, actorUserId?: string | null, durableJobId?: string | null) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status,connection_metadata').eq('id', sourceId).maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve discovery source: ${sourceError?.message ?? 'not found'}`)
  if (!['ACTIVE', 'CONFIGURED'].includes(String(source.status).toUpperCase())) throw new Error('Source must be ACTIVE or CONFIGURED before metadata discovery.')

  const typedSource = source as Source
  const runIdentity = await loadOrCreateRun(typedSource, actorUserId, durableJobId)
  if (runIdentity.alreadyPublished) {
    const { data: completed, error: completedError } = await admin.schema('catalog').from('discovery_runs').select('catalog_revision_id,objects_observed,objects_added,objects_changed,objects_missing,objects_removed,objects_unchanged,consistency_mode,schema_snapshot').eq('id', runIdentity.id).single()
    if (completedError || !completed) throw new Error(`Unable to load completed discovery run: ${completedError?.message ?? 'not found'}`)
    const lineage = await queueLineageEnrichment({
      source: typedSource,
      discoveryRunId: runIdentity.id,
      catalogRevisionId: completed.catalog_revision_id,
      actorUserId,
    })
    return {
      discoveryRunId: runIdentity.id,
      sourceId: source.id,
      scopeId: runIdentity.frozenScope.scopeId,
      scopeVersionId: runIdentity.frozenScope.scopeVersionId,
      catalogRevisionId: completed.catalog_revision_id,
      objectsObserved: completed.objects_observed,
      objectsAdded: completed.objects_added,
      objectsChanged: completed.objects_changed,
      objectsMissing: completed.objects_missing,
      objectsRemoved: completed.objects_removed,
      objectsUnchanged: completed.objects_unchanged,
      consistencyMode: completed.consistency_mode,
      lineage,
      snapshot: completed.schema_snapshot,
    }
  }

  const runId = runIdentity.id
  const frozenScope = runIdentity.frozenScope
  try {
    const sourceType = String(source.source_type).toUpperCase()
    let result: DiscoveryResult
    if (sourceType === 'JDBC') {
      const frozenMetadata = { ...record(source.connection_metadata), hierarchy_selection: frozenScope.nativeSelection }
      result = await discoverJdbcFromNativeHierarchy(frozenMetadata, checkpointAdapter(runId))
    } else if (['FILE', 'CSV'].includes(sourceType)) {
      result = await discoverFile(typedSource)
    } else {
      throw new Error(`No metadata discovery adapter is registered for source type ${sourceType}.`)
    }

    await persistConnectorCapabilities(typedSource, result.snapshot)
    const manifest = manifestFromResult(result)
    const observedTo = new Date().toISOString()
    if (!manifest.complete) {
      const message = `Metadata discovery is incomplete: observed ${manifest.observed_object_count}/${manifest.expected_object_count} required objects and ${manifest.observed_field_count}/${manifest.expected_field_count} required fields; ${manifest.failed_item_count} failures; truncated=${manifest.truncated}. No catalog revision was published.`
      await markIncomplete(runId, manifest, message, result.snapshot)
      throw new Error(message)
    }

    const { data: publicationData, error: publicationError } = await admin.schema('catalog').rpc('publish_discovery_revision', {
      p_run_id: runId,
      p_source_id: source.id,
      p_scope_id: frozenScope.scopeId,
      p_scope_version_id: frozenScope.scopeVersionId,
      p_manifest: manifest,
      p_assets: result.assets,
      p_observed_from: runIdentity.observedFrom,
      p_observed_to: observedTo,
      p_consistency_mode: manifest.consistency_mode,
    })
    if (publicationError) throw new Error(`Atomic catalog publication failed: ${publicationError.message}`)

    const publication = record(publicationData)
    const catalogRevisionId = stringField(publication, ['revision_id'])
    const lineage = await queueLineageEnrichment({
      source: typedSource,
      discoveryRunId: runId,
      catalogRevisionId,
      actorUserId,
    })
    const finalSnapshot = {
      ...result.snapshot,
      discovery_manifest: manifest,
      frozen_scope: {
        scope_id: frozenScope.scopeId,
        scope_version_id: frozenScope.scopeVersionId,
        scope_version_number: frozenScope.versionNumber,
        scope_hash: frozenScope.scopeHash,
        native_selection: frozenScope.nativeSelection,
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
        lineage,
        ai_semantics: 'DEFERRED',
        classification: 'DEFERRED',
        business_domain: 'DEFERRED',
        criticality: 'DEFERRED',
        glossary_matching: 'DEFERRED',
      },
    }

    const { error: snapshotError } = await admin.schema('catalog').from('discovery_runs').update({
      schema_snapshot: finalSnapshot,
      error_message: null,
    }).eq('id', runId)
    if (snapshotError) console.error('[metadata-discovery-snapshot]', snapshotError.message)

    return {
      discoveryRunId: runId,
      sourceId: source.id,
      scopeId: frozenScope.scopeId,
      scopeVersionId: frozenScope.scopeVersionId,
      catalogRevisionId,
      catalogRevisionNumber: integer(publication.revision_number, 0),
      objectsObserved: integer(publication.objects_observed, manifest.observed_object_count),
      objectsAdded: integer(publication.objects_added, 0),
      objectsChanged: integer(publication.objects_changed, 0),
      objectsMissing: integer(publication.objects_missing, 0),
      objectsRemoved: integer(publication.objects_removed, 0),
      objectsUnchanged: integer(publication.objects_unchanged, 0),
      consistencyMode: manifest.consistency_mode,
      lineage,
      snapshot: finalSnapshot,
    }
  } catch (error) {
    const { data: currentRun } = await admin.schema('catalog').from('discovery_runs').select('status,catalog_revision_id').eq('id', runId).maybeSingle()
    const alreadyPublished = currentRun?.status === 'COMPLETED' && Boolean(currentRun.catalog_revision_id)
    if (!alreadyPublished && currentRun?.status !== 'INCOMPLETE') {
      await admin.schema('catalog').from('discovery_runs').update({
        status: 'FAILED',
        error_message: error instanceof Error ? error.message : 'Metadata discovery failed.',
        observed_to: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
    }
    throw error
  }
}
