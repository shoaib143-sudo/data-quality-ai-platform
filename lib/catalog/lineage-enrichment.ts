import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  discoverJdbcTransformations,
  jdbcEngineFromUrl,
  type JdbcColumnMapping,
  type JdbcTransformation,
} from '@/lib/connectors/jdbc'

type Source = {
  id: string
  project_id: string
  name: string
  source_type: string
  connection_metadata: Record<string, unknown> | null
}

type DiscoveredAsset = {
  id: string
  asset_type: string
  namespace: string | null
  name: string
  columns: unknown[]
  metadata: Record<string, unknown>
  identity_key?: string | null
}

type PersistedLineageAsset = { id: string; dataset_id: string | null; namespace: string; name: string }
type ScopedLineageDiscovery = {
  transformations: JdbcTransformation[]
  warnings: string[]
  details: Record<string, unknown>
}
export type LineageEnrichmentResult = {
  transformations: number
  edges: number
  columnMappings: number
  warnings: string[]
  engine: string
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]))
  }
  return value
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value)) ?? 'null'
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function qualified(namespace: string | null, name: string) {
  return namespace ? `${namespace}.${name}` : name
}

function isDatabricksSystemAccessPermissionWarning(value: string) {
  const normalized = value.toLowerCase()
  return normalized.includes('insufficient_permissions')
    && normalized.includes('use schema')
    && normalized.includes('system.access')
}

function sqlDependencies(logic: string) {
  const result: string[] = []
  const regex = /\b(?:from|join|using)\s+([`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*(?:\.[`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*){0,2}[`"\]]?)/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(logic))) result.push(match[1].replace(/[`"\[\]]/g, ''))
  return [...new Set(result.map(value => value.toLowerCase()))]
}

function splitLineageAsset(fullName: string) {
  const parts = fullName.split('.').map(part => part.trim()).filter(Boolean)
  return { namespace: parts.length > 1 ? parts.slice(0, -1).join('.') : '', name: parts.at(-1) ?? fullName }
}

function databricksLineageEventIdentity(transformation: JdbcTransformation) {
  const metadata = record(transformation.metadata)
  const connectorHash = stringField(metadata, ['source_event_key_hash'])
  if (connectorHash && /^[0-9a-f]{64}$/i.test(connectorHash)) return connectorHash.toLowerCase()
  return sha256Hex(stableJson({
    sourceAsset: transformation.sourceAsset ?? null,
    targetAsset: transformation.targetAsset ?? null,
    entityType: metadata.entity_type ?? null,
    entityId: metadata.entity_id ?? null,
    eventTime: metadata.event_time ?? null,
  }))
}

function mappingSortKey(mapping: JdbcColumnMapping) {
  return stableJson({
    sourceAsset: mapping.sourceAsset,
    sourceColumn: mapping.sourceColumn,
    targetAsset: mapping.targetAsset,
    targetColumn: mapping.targetColumn,
    operation: mapping.operation ?? null,
    expression: mapping.expression ?? null,
    metadata: mapping.metadata ?? {},
  })
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map(value => value.trim()))]
}

async function discoverDatabricksScopedLineage(input: { jdbcUrl: string; credentialRef: string; catalogs: string[] }): Promise<ScopedLineageDiscovery> {
  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke('dgp-databricks-connector', {
    body: {
      action: 'lineage_scope',
      jdbc_url: input.jdbcUrl,
      credential_ref: input.credentialRef,
      catalogs: input.catalogs,
    },
  })
  if (error) throw new Error(`Databricks scoped lineage connector failed: ${error.message}`)
  const payload = record(data)
  const connectorError = stringField(payload, ['error'])
  if (connectorError) throw new Error(`Databricks scoped lineage connector failed: ${connectorError}`)
  return {
    transformations: Array.isArray(payload.transformations) ? payload.transformations as JdbcTransformation[] : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : [],
    details: record(payload.details),
  }
}

async function ingestDatabricksAuthoritativeLineage(
  source: Source,
  actorUserId: string,
  transformations: JdbcTransformation[],
  context: { discoveryRunId: string; catalogRevisionId: string },
) {
  const admin = createAdminClient()
  const grouped = new Map<string, { transformation: JdbcTransformation; mappings: Map<string, JdbcColumnMapping> }>()

  for (const transformation of transformations) {
    if (!transformation.sourceAsset || !transformation.targetAsset) continue
    const authoritative = String(record(transformation.metadata).authoritative_source ?? '').toLowerCase()
    if (!['system.access.column_lineage', 'system.access.table_lineage'].includes(authoritative)) {
      throw new Error(`Databricks lineage for ${transformation.sourceAsset} -> ${transformation.targetAsset} lacks authoritative system.access provenance.`)
    }
    if (transformation.columnMappings?.length && authoritative !== 'system.access.column_lineage') {
      throw new Error(`Databricks field lineage for ${transformation.sourceAsset} -> ${transformation.targetAsset} lacks system.access.column_lineage provenance.`)
    }
    const externalEventId = `databricks-system-lineage:${databricksLineageEventIdentity(transformation)}`
    const current = grouped.get(externalEventId) ?? { transformation, mappings: new Map<string, JdbcColumnMapping>() }
    for (const mapping of transformation.columnMappings ?? []) current.mappings.set(mappingSortKey(mapping), mapping)
    grouped.set(externalEventId, current)
  }

  const events: Record<string, unknown>[] = []
  let columnMappings = 0
  for (const [externalEventId, group] of grouped) {
    const transformation = group.transformation
    const sourceAsset = transformation.sourceAsset!
    const targetAsset = transformation.targetAsset!
    const sourceParts = splitLineageAsset(sourceAsset)
    const targetParts = splitLineageAsset(targetAsset)
    const metadata = record(transformation.metadata)
    const authoritativeSource = String(metadata.authoritative_source ?? 'system.access.table_lineage').toLowerCase()
    const mappings = [...group.mappings.values()].sort((left, right) => mappingSortKey(left).localeCompare(mappingSortKey(right)))
    columnMappings += mappings.length
    const governedMappings = mappings.map(mapping => ({
      sourceAsset: mapping.sourceAsset || sourceAsset,
      sourceColumn: mapping.sourceColumn,
      targetAsset: mapping.targetAsset || targetAsset,
      targetColumn: mapping.targetColumn,
      operation: mapping.operation ?? transformation.operation,
      expression: mapping.expression ?? null,
      metadata: { ...(mapping.metadata ?? {}), authoritative_source: 'system.access.column_lineage', data_source_id: source.id, catalog_revision_id: context.catalogRevisionId },
    }))
    const logicHash = sha256Hex(stableJson({ sourceAsset, targetAsset, operation: transformation.operation, mappings: governedMappings }))
    const stableMetadata = {
      ...metadata,
      data_source_id: source.id,
      discovery_run_id: context.discoveryRunId,
      catalog_revision_id: context.catalogRevisionId,
      authoritative_source: authoritativeSource,
    }
    const eventWithoutHash = {
      externalEventId,
      eventType: 'COMPLETE',
      jobNamespace: 'databricks.system.access',
      jobName: authoritativeSource === 'system.access.column_lineage' ? 'column_lineage' : 'table_lineage',
      dataSourceId: source.id,
      discoveryRunId: context.discoveryRunId,
      catalogRevisionId: context.catalogRevisionId,
      inputs: [{
        namespace: sourceParts.namespace,
        name: sourceParts.name,
        assetType: 'DATASET',
        metadata: { data_source_id: source.id, discovery_run_id: context.discoveryRunId, catalog_revision_id: context.catalogRevisionId, databricks_full_name: sourceAsset, authoritative_source: authoritativeSource },
      }],
      outputs: [{
        namespace: targetParts.namespace,
        name: targetParts.name,
        assetType: 'DATASET',
        metadata: { data_source_id: source.id, discovery_run_id: context.discoveryRunId, catalog_revision_id: context.catalogRevisionId, databricks_full_name: targetAsset, authoritative_source: authoritativeSource },
      }],
      transformation: {
        externalId: `databricks-lineage:${externalEventId.slice('databricks-system-lineage:'.length)}`,
        sourceSystem: 'DATABRICKS',
        name: `${sourceParts.name} to ${targetParts.name}`,
        operation: transformation.operation || 'DATABRICKS_LINEAGE_EVENT',
        logicHash,
        metadata: stableMetadata,
        columnMappings: governedMappings,
      },
    }
    events.push({ ...eventWithoutHash, payloadHash: sha256Hex(stableJson(eventWithoutHash)) })
  }

  if (!events.length) return { transformations: 0, edges: 0, columnMappings: 0 }

  let transformationsIngested = 0
  let edges = 0
  for (let index = 0; index < events.length; index += 100) {
    const { data, error } = await admin.schema('governance').rpc('ingest_lineage_batch_atomic', {
      p_project_id: source.project_id,
      p_actor: actorUserId,
      p_source_key: `jdbc-source:${source.id}`,
      p_source_name: `${source.name} JDBC metadata lineage`,
      p_source_system: 'DATABRICKS',
      p_events: events.slice(index, index + 100),
    })
    if (error) throw new Error(`Governed Databricks lineage ingestion failed: ${error.message}`)
    const result = record(data)
    transformationsIngested += Number(result.transformationCount ?? 0)
    edges += Number(result.edgeCount ?? 0)
  }
  return { transformations: transformationsIngested, edges, columnMappings }
}

async function persistJdbcLineage(
  source: Source,
  discoveryRunId: string,
  catalogRevisionId: string,
  assets: DiscoveredAsset[],
  inputTransformations: JdbcTransformation[],
  actorUserId: string | null,
) {
  if (!inputTransformations.length) return { transformations: 0, edges: 0, columnMappings: 0 }
  const engine = String(inputTransformations[0]?.engine || 'JDBC').toUpperCase()
  let governed = { transformations: 0, edges: 0, columnMappings: 0 }
  let transformations = inputTransformations
  if (engine === 'DATABRICKS') {
    const authoritative = inputTransformations.filter(item => {
      const source = String(record(item.metadata).authoritative_source ?? '').toLowerCase()
      return Boolean(item.sourceAsset && item.targetAsset) && ['system.access.column_lineage', 'system.access.table_lineage'].includes(source)
    })
    if (authoritative.length) {
      if (!actorUserId) throw new Error('Databricks lineage ingestion requires the accountable Web UI discovery actor.')
      governed = await ingestDatabricksAuthoritativeLineage(source, actorUserId, authoritative, { discoveryRunId, catalogRevisionId })
      const governedSet = new Set(authoritative)
      transformations = inputTransformations.filter(item => !governedSet.has(item))
    }
  }
  if (!transformations.length) return governed

  const admin = createAdminClient()
  const legacyEngine = transformations[0]?.engine || engine || 'JDBC'
  const { data: integration, error: integrationError } = await admin.schema('governance').from('lineage_integrations').upsert({
    project_id: source.project_id,
    source_key: `jdbc-source:${source.id}`,
    name: `${source.name} JDBC metadata lineage`,
    integration_type: legacyEngine,
    enabled: true,
  }, { onConflict: 'project_id,source_key' }).select('id').single()
  if (integrationError || !integration) throw new Error(`Unable to register JDBC lineage integration: ${integrationError?.message ?? 'unknown error'}`)

  const assetByKey = new Map<string, PersistedLineageAsset>()
  const registeredDatasets = await admin.schema('catalog').from('datasets').select('id,name,source_identifier').eq('project_id', source.project_id).eq('data_source_id', source.id)
  if (registeredDatasets.error) throw new Error(`Unable to resolve registered JDBC datasets for lineage: ${registeredDatasets.error.message}`)

  for (const asset of assets) {
    const namespace = asset.namespace ?? ''
    const full = qualified(namespace, asset.name)
    const dataset = (registeredDatasets.data ?? []).find(row => [row.name, row.source_identifier].filter(Boolean).some(value => {
      const normalized = String(value).toLowerCase()
      return normalized === asset.name.toLowerCase() || normalized === full.toLowerCase()
    }))
    const identityResolution = asset.identity_key?.startsWith('native:') ? 'CATALOG_IDENTITY' : asset.identity_key ? 'QUALIFIED_LOCATOR' : null
    const { data, error } = await admin.schema('governance').from('lineage_assets').upsert({
      project_id: source.project_id,
      integration_id: integration.id,
      namespace,
      name: asset.name,
      asset_type: asset.asset_type,
      dataset_id: dataset?.id ?? null,
      data_source_id: source.id,
      catalog_identity_key: asset.identity_key ?? null,
      discovered_asset_id: asset.id,
      catalog_revision_id: catalogRevisionId,
      identity_resolution: identityResolution,
      identity_evidence: { full_name: full, catalog_identity_key: asset.identity_key ?? null, catalog_match: true },
      metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, catalog_identity_key: asset.identity_key ?? null, auto_discovered: true },
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'project_id,namespace,name,asset_type' }).select('id,dataset_id,namespace,name').single()
    if (error || !data) throw new Error(`Unable to register JDBC lineage asset ${full}: ${error?.message ?? 'unknown error'}`)
    assetByKey.set(full.toLowerCase(), data)
    if (!assetByKey.has(asset.name.toLowerCase())) assetByKey.set(asset.name.toLowerCase(), data)
  }

  const resolveAsset = async (fullName: string, authoritative = false) => {
    const key = fullName.toLowerCase()
    const existing = assetByKey.get(key) || (!key.includes('.') ? assetByKey.get(key.split('.').at(-1)!) : undefined)
    if (existing) return existing
    const parts = splitLineageAsset(fullName)
    const { data, error } = await admin.schema('governance').from('lineage_assets').upsert({
      project_id: source.project_id,
      integration_id: integration.id,
      namespace: parts.namespace,
      name: parts.name,
      asset_type: 'DATASET',
      data_source_id: source.id,
      catalog_revision_id: catalogRevisionId,
      identity_resolution: 'EXTERNAL_DEPENDENCY',
      identity_evidence: { full_name: fullName, catalog_match: false, authoritative_lineage_source: authoritative ? 'DATABRICKS_SYSTEM_LINEAGE' : undefined },
      metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, dependency_only: true, authoritative_lineage_source: authoritative ? 'DATABRICKS_SYSTEM_LINEAGE' : undefined },
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'project_id,namespace,name,asset_type' }).select('id,dataset_id,namespace,name').single()
    if (error || !data) throw new Error(`Unable to register JDBC lineage dependency ${fullName}: ${error?.message ?? 'unknown error'}`)
    assetByKey.set(key, data)
    return data as PersistedLineageAsset
  }

  let edges = 0
  let columnMappings = 0
  for (const transformation of transformations) {
    const structured = Boolean(transformation.sourceAsset && transformation.targetAsset)
    const externalId = structured ? `databricks-lineage:${transformation.logicHash}` : [transformation.catalog, transformation.schema, transformation.name].filter(Boolean).join('.')
    const { data: persisted, error: transformationError } = await admin.schema('governance').from('lineage_transformations').upsert({
      project_id: source.project_id,
      integration_id: integration.id,
      external_id: externalId,
      source_system: transformation.engine || legacyEngine,
      name: transformation.name,
      operation: transformation.operation || 'VIEW',
      logic_language: transformation.transformationLogic ? 'SQL' : null,
      transformation_logic: transformation.transformationLogic || null,
      logic_hash: transformation.logicHash,
      metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, catalog: transformation.catalog ?? null, schema: transformation.schema ?? null, ...(transformation.metadata ?? {}) },
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'project_id,integration_id,external_id' }).select('id').single()
    if (transformationError || !persisted) throw new Error(`Unable to persist JDBC transformation ${externalId}: ${transformationError?.message ?? 'unknown error'}`)

    if (structured) {
      const sourceAsset = await resolveAsset(transformation.sourceAsset!, true)
      const targetAsset = await resolveAsset(transformation.targetAsset!, true)
      const { error: edgeError } = await admin.schema('governance').from('lineage_edges').upsert({
        project_id: source.project_id,
        source_type: sourceAsset.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        source_id: sourceAsset.dataset_id ?? sourceAsset.id,
        target_type: targetAsset.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        target_id: targetAsset.dataset_id ?? targetAsset.id,
        relationship: 'TRANSFORMS_TO',
        transformation_id: persisted.id,
        metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, operation: transformation.operation, logic_hash: transformation.logicHash, auto_discovered: true, authoritative_source: transformation.metadata?.authoritative_source ?? 'DATABRICKS_SYSTEM_LINEAGE' },
      }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id' })
      if (!edgeError) edges += 1

      if (transformation.columnMappings?.length) {
        const { error: deleteError } = await admin.schema('governance').from('lineage_column_mappings').delete().eq('transformation_id', persisted.id)
        if (deleteError) throw new Error(`Unable to refresh JDBC column mappings for ${externalId}: ${deleteError.message}`)
        const mappingRows = []
        for (const mapping of transformation.columnMappings) {
          const mappingSource = await resolveAsset(mapping.sourceAsset || transformation.sourceAsset!, true)
          const mappingTarget = await resolveAsset(mapping.targetAsset || transformation.targetAsset!, true)
          mappingRows.push({
            project_id: source.project_id,
            transformation_id: persisted.id,
            source_asset_id: mappingSource.id,
            source_column: mapping.sourceColumn,
            target_asset_id: mappingTarget.id,
            target_column: mapping.targetColumn,
            operation: mapping.operation ?? transformation.operation,
            expression: mapping.expression ?? null,
            metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, auto_discovered: true, ...(mapping.metadata ?? {}) },
          })
        }
        if (mappingRows.length) {
          const { error: mappingError } = await admin.schema('governance').from('lineage_column_mappings').insert(mappingRows)
          if (mappingError) throw new Error(`Unable to persist JDBC column mappings for ${externalId}: ${mappingError.message}`)
          columnMappings += mappingRows.length
        }
      }
      continue
    }

    const targetKey = [transformation.catalog, transformation.schema, transformation.name].filter(Boolean).join('.').toLowerCase()
    const target = assetByKey.get(targetKey) || assetByKey.get([transformation.schema, transformation.name].filter(Boolean).join('.').toLowerCase())
    if (!target) continue
    for (const dependency of sqlDependencies(transformation.transformationLogic)) {
      const sourceAsset = await resolveAsset(dependency)
      const { error } = await admin.schema('governance').from('lineage_edges').upsert({
        project_id: source.project_id,
        source_type: sourceAsset.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        source_id: sourceAsset.dataset_id ?? sourceAsset.id,
        target_type: target.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        target_id: target.dataset_id ?? target.id,
        relationship: 'TRANSFORMS_TO',
        transformation_id: persisted.id,
        metadata: { source_id: source.id, discovery_run_id: discoveryRunId, catalog_revision_id: catalogRevisionId, operation: transformation.operation, logic_hash: transformation.logicHash, auto_discovered: true },
      }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id' })
      if (!error) edges += 1
    }
  }

  return { transformations: governed.transformations + transformations.length, edges: governed.edges + edges, columnMappings: governed.columnMappings + columnMappings }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function updateLineageSnapshot(discoveryRunId: string, lineage: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data: run, error } = await admin.schema('catalog').from('discovery_runs').select('schema_snapshot').eq('id', discoveryRunId).maybeSingle()
  if (error || !run) return
  const snapshot = record(run.schema_snapshot)
  const enrichments = record(snapshot.enrichments)
  const status = typeof lineage.status === 'string' && lineage.status ? lineage.status : null
  const blockerCode = typeof lineage.blocker_code === 'string' && lineage.blocker_code ? lineage.blocker_code : null
  const { error: updateError } = await admin.schema('catalog').from('discovery_runs').update({
    schema_snapshot: { ...snapshot, lineage_enrichment_status: status ?? snapshot.lineage_enrichment_status, lineage_enrichment_blocker: blockerCode, enrichments: { ...enrichments, lineage } },
  }).eq('id', discoveryRunId)
  if (updateError) console.error('[lineage-enrichment-snapshot]', updateError.message)
}

async function beginLineageRun(input: {
  source: Source
  discoveryRunId: string
  catalogRevisionId: string
  catalogs: string[]
  authoritativeSources: string[]
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.schema('governance').from('lineage_enrichment_runs').upsert({
    project_id: input.source.project_id,
    source_id: input.source.id,
    discovery_run_id: input.discoveryRunId,
    catalog_revision_id: input.catalogRevisionId,
    status: 'RUNNING',
    authoritative_sources: input.authoritativeSources,
    scope_catalogs: input.catalogs,
    complete: false,
    truncated: false,
    transformation_count: 0,
    edge_count: 0,
    column_mapping_count: 0,
    warning_count: 0,
    blocker_code: null,
    blocker_resource: null,
    blocker_permission: null,
    blocker_detail: null,
    evidence: {},
    started_at: now,
    completed_at: null,
    updated_at: now,
  }, { onConflict: 'source_id,catalog_revision_id' })
  if (error) throw new Error(`Unable to start durable lineage enrichment evidence: ${error.message}`)
}

async function finishLineageRun(input: {
  source: Source
  catalogRevisionId: string
  status: string
  complete: boolean
  truncated: boolean
  transformations: number
  edges: number
  columnMappings: number
  warnings: string[]
  blockerCode?: string | null
  blockerResource?: string | null
  blockerPermission?: string | null
  blockerDetail?: string | null
  evidence?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.schema('governance').from('lineage_enrichment_runs').update({
    status: input.status,
    complete: input.complete,
    truncated: input.truncated,
    transformation_count: input.transformations,
    edge_count: input.edges,
    column_mapping_count: input.columnMappings,
    warning_count: input.warnings.length,
    blocker_code: input.blockerCode ?? null,
    blocker_resource: input.blockerResource ?? null,
    blocker_permission: input.blockerPermission ?? null,
    blocker_detail: input.blockerDetail ?? null,
    evidence: { ...(input.evidence ?? {}), warnings: input.warnings.slice(0, 20) },
    completed_at: now,
    updated_at: now,
  }).eq('source_id', input.source.id).eq('catalog_revision_id', input.catalogRevisionId)
  if (error) throw new Error(`Unable to finalize durable lineage enrichment evidence: ${error.message}`)
}

export async function executeLineageEnrichment(input: {
  sourceId: string
  discoveryRunId: string
  actorUserId?: string | null
}): Promise<LineageEnrichmentResult> {
  const admin = createAdminClient()
  const [{ data: sourceData, error: sourceError }, { data: runContext, error: runError }] = await Promise.all([
    admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,connection_metadata').eq('id', input.sourceId).maybeSingle(),
    admin.schema('catalog').from('discovery_runs').select('id,source_id,catalog_revision_id').eq('id', input.discoveryRunId).maybeSingle(),
  ])
  if (sourceError || !sourceData) throw new Error(`Unable to resolve lineage source: ${sourceError?.message ?? 'not found'}`)
  if (runError || !runContext) throw new Error(`Unable to resolve lineage discovery run: ${runError?.message ?? 'not found'}`)
  if (runContext.source_id !== input.sourceId) throw new Error('Lineage discovery run does not belong to the requested source.')
  const source = sourceData as Source
  if (String(source.source_type).toUpperCase() !== 'JDBC') {
    const result = { transformations: 0, edges: 0, columnMappings: 0, warnings: [], engine: 'NOT_APPLICABLE' }
    await updateLineageSnapshot(input.discoveryRunId, { status: 'NOT_APPLICABLE', ...result })
    return result
  }
  const catalogRevisionId = String(runContext.catalog_revision_id ?? '').trim()
  if (!catalogRevisionId) throw new Error('JDBC lineage enrichment requires a published catalog revision identity.')

  const metadata = record(source.connection_metadata)
  const jdbcUrl = stringField(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = stringField(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  if (!jdbcUrl || !credentialRef) throw new Error('JDBC lineage enrichment requires jdbc_url and credential_ref.')
  const engine = jdbcEngineFromUrl(jdbcUrl)

  const { data: states, error: stateError } = await admin.schema('catalog').from('scope_asset_state').select('discovered_asset_id').eq('source_id', source.id).eq('presence_state', 'ACTIVE')
  if (stateError) throw new Error(`Unable to resolve active catalog assets for lineage: ${stateError.message}`)
  const activeAssetIds = [...new Set((states ?? []).map(row => row.discovered_asset_id).filter((id): id is string => Boolean(id)))]
  let assetQuery = admin.schema('catalog').from('discovered_assets').select('id,asset_type,namespace,name,columns,metadata,identity_key').eq('source_id', source.id).eq('is_current', true)
  if (activeAssetIds.length) assetQuery = assetQuery.in('id', activeAssetIds)
  const { data: assetRows, error: assetError } = await assetQuery.order('asset_key')
  if (assetError) throw new Error(`Unable to load active discovered assets for lineage: ${assetError.message}`)
  const assets = (assetRows ?? []) as DiscoveredAsset[]
  const catalogs = uniqueStrings(assets.map(asset => stringField(record(asset.metadata), ['catalog'])))
  const authoritativeSources = engine === 'DATABRICKS' ? ['system.access.column_lineage', 'system.access.table_lineage'] : []

  await beginLineageRun({ source, discoveryRunId: input.discoveryRunId, catalogRevisionId, catalogs, authoritativeSources })
  try {
    let transformations: JdbcTransformation[] = []
    let warnings: string[] = []
    let discoveryDetails: Record<string, unknown> = {}

    if (engine === 'DATABRICKS') {
      if (!catalogs.length) throw new Error('Databricks lineage enrichment requires at least one catalog from the published discovery scope.')
      const scoped = await discoverDatabricksScopedLineage({ jdbcUrl, credentialRef, catalogs })
      transformations = scoped.transformations
      warnings = [...new Set(scoped.warnings)]
      discoveryDetails = scoped.details
    } else {
      const lineageTargets = assets.filter(asset => String(asset.asset_type).toUpperCase().includes('VIEW'))
      const results = await mapConcurrent(lineageTargets, 4, async asset => {
        const assetMetadata = record(asset.metadata)
        const catalog = stringField(assetMetadata, ['catalog'])
        const schema = stringField(assetMetadata, ['schema'])
        try {
          const lineage = await discoverJdbcTransformations({ jdbcUrl, credentialRef, catalog, schema, table: asset.name })
          return { transformations: lineage.transformations, warnings: lineage.warnings }
        } catch (error) {
          return { transformations: [] as JdbcTransformation[], warnings: [`Transformation discovery failed for ${qualified(asset.namespace, asset.name)}: ${error instanceof Error ? error.message : 'unknown error'}`] }
        }
      })
      transformations = results.flatMap(result => result.transformations)
      warnings = [...new Set(results.flatMap(result => result.warnings))]
      discoveryDetails = { mode: 'OBJECT_VIEW_SCAN', query_count: lineageTargets.length }
    }

    transformations = [...new Map(transformations.map(item => [`${item.sourceAsset ?? ''}->${item.targetAsset ?? ''}:${item.logicHash}`, item])).values()]
    const persisted = await persistJdbcLineage(source, input.discoveryRunId, catalogRevisionId, assets, transformations, input.actorUserId?.trim() || null)
    const result = { ...persisted, warnings, engine }
    const databricksSystemAccessBlocked = engine === 'DATABRICKS'
      && result.transformations === 0
      && result.edges === 0
      && result.columnMappings === 0
      && warnings.some(isDatabricksSystemAccessPermissionWarning)
    const truncated = discoveryDetails.truncated === true
    const providerComplete = discoveryDetails.complete === true
    const status = databricksSystemAccessBlocked ? 'BLOCKED' : warnings.length || truncated ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED'
    const complete = status === 'COMPLETED' && (engine !== 'DATABRICKS' || providerComplete)
    const blockerDetail = databricksSystemAccessBlocked ? 'The Databricks principal cannot read system.access lineage tables until USE SCHEMA on system.access is granted.' : null

    const snapshotPayload = {
      status,
      blocker_code: databricksSystemAccessBlocked ? 'DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED' : null,
      blocker_resource: databricksSystemAccessBlocked ? 'system.access' : null,
      blocker_permission: databricksSystemAccessBlocked ? 'USE SCHEMA' : null,
      blocker_detail: blockerDetail,
      authoritative_column_source: engine === 'DATABRICKS' ? 'system.access.column_lineage' : null,
      authoritative_table_source: engine === 'DATABRICKS' ? 'system.access.table_lineage' : null,
      catalog_revision_id: catalogRevisionId,
      transformation_count: result.transformations,
      edge_count: result.edges,
      column_mapping_count: result.columnMappings,
      warning_count: warnings.length,
      warnings: warnings.slice(0, 20),
      scope_catalogs: catalogs,
      provider_complete: providerComplete,
      provider_truncated: truncated,
      provider_details: discoveryDetails,
    }
    await updateLineageSnapshot(input.discoveryRunId, snapshotPayload)
    await finishLineageRun({
      source,
      catalogRevisionId,
      status,
      complete,
      truncated,
      transformations: result.transformations,
      edges: result.edges,
      columnMappings: result.columnMappings,
      warnings,
      blockerCode: databricksSystemAccessBlocked ? 'DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED' : null,
      blockerResource: databricksSystemAccessBlocked ? 'system.access' : null,
      blockerPermission: databricksSystemAccessBlocked ? 'USE SCHEMA' : null,
      blockerDetail,
      evidence: { discovery_run_id: input.discoveryRunId, catalog_revision_id: catalogRevisionId, provider_details: discoveryDetails },
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lineage enrichment failed.'
    await updateLineageSnapshot(input.discoveryRunId, { status: 'FAILED', catalog_revision_id: catalogRevisionId, error: message })
    await finishLineageRun({
      source,
      catalogRevisionId,
      status: 'FAILED',
      complete: false,
      truncated: false,
      transformations: 0,
      edges: 0,
      columnMappings: 0,
      warnings: [message],
      evidence: { discovery_run_id: input.discoveryRunId, catalog_revision_id: catalogRevisionId, error: message },
    }).catch(runError => console.error('[lineage-enrichment-run-finalize]', runError instanceof Error ? runError.message : runError))
    throw error
  }
}
