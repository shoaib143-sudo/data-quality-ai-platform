import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { normalizeLineagePayload, type NormalizedLineageAsset, type NormalizedLineageEvent } from '@/lib/governance/lineage-adapters'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function cleanObject(value: unknown) {
  const source = object(value)
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/(password|secret|token|credential|authorization|api.?key|private.?key)/i.test(key)).slice(0, 100))
}
function hashPayload(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function assetKey(asset: { namespace?: string | null; name?: string | null }) { return `${asset.namespace ?? ''}.${asset.name ?? ''}`.replace(/^\./, '').toLowerCase() }

async function resolveAsset(admin: ReturnType<typeof createAdminClient>, projectId: string, integrationId: string, input: NormalizedLineageAsset) {
  const namespace = text(input.namespace)
  const name = text(input.name)
  const assetType = (text(input.assetType) || 'DATASET').toUpperCase()
  let datasetId = text(input.datasetId) || null

  if (datasetId) {
    const { data: dataset } = await admin.schema('catalog').from('datasets').select('id').eq('id', datasetId).eq('project_id', projectId).maybeSingle()
    if (!dataset) datasetId = null
  }
  if (!datasetId) {
    const qualified = namespace ? `${namespace}.${name}` : name
    const [{ data: byName, error: byNameError }, { data: byIdentifier, error: byIdentifierError }, { data: byQualifiedIdentifier, error: qualifiedError }] = await Promise.all([
      admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('name', name).limit(2),
      admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('source_identifier', name).limit(2),
      admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('source_identifier', qualified).limit(2),
    ])
    if (byNameError) throw new Error(`Unable to resolve lineage dataset name: ${byNameError.message}`)
    if (byIdentifierError) throw new Error(`Unable to resolve lineage source identifier: ${byIdentifierError.message}`)
    if (qualifiedError) throw new Error(`Unable to resolve qualified lineage source identifier: ${qualifiedError.message}`)
    const matches = new Set([...(byName ?? []), ...(byIdentifier ?? []), ...(byQualifiedIdentifier ?? [])].map((row) => row.id))
    if (matches.size === 1) datasetId = [...matches][0]
  }

  const metadata = { ...cleanObject(input.metadata), facets: cleanObject(input.facets), integration_source: 'lineage_ingest' }
  const { data, error } = await admin.schema('governance').from('lineage_assets').upsert({
    project_id: projectId,
    integration_id: integrationId,
    namespace,
    name,
    asset_type: assetType,
    dataset_id: datasetId,
    metadata,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'project_id,namespace,name,asset_type' }).select('id,dataset_id,namespace,name,asset_type').single()
  if (error || !data) throw new Error(`Unable to register lineage asset ${namespace}:${name}: ${error?.message ?? 'unknown error'}`)
  return data
}

async function persistTransformation(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  integrationId: string,
  event: NormalizedLineageEvent,
  inputAssets: Array<{ id: string; dataset_id: string | null; namespace: string; name: string; asset_type: string }>,
  outputAssets: Array<{ id: string; dataset_id: string | null; namespace: string; name: string; asset_type: string }>,
) {
  if (!event.transformation) return null
  const t = event.transformation
  const { data, error } = await admin.schema('governance').from('lineage_transformations').upsert({
    project_id: projectId,
    integration_id: integrationId,
    external_id: t.externalId,
    source_system: t.sourceSystem,
    name: t.name,
    operation: t.operation || 'TRANSFORM',
    logic_language: t.logicLanguage,
    transformation_logic: t.transformationLogic,
    logic_hash: t.logicHash,
    metadata: cleanObject(t.metadata),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'project_id,integration_id,external_id' }).select('*').single()
  if (error || !data) throw new Error(`Unable to persist lineage transformation: ${error?.message ?? 'unknown error'}`)

  const inputByName = new Map<string, typeof inputAssets[number]>()
  const outputByName = new Map<string, typeof outputAssets[number]>()
  for (const asset of inputAssets) {
    inputByName.set(assetKey(asset), asset)
    inputByName.set(asset.name.toLowerCase(), asset)
  }
  for (const asset of outputAssets) {
    outputByName.set(assetKey(asset), asset)
    outputByName.set(asset.name.toLowerCase(), asset)
  }

  if (t.columnMappings.length) {
    const { error: deleteError } = await admin.schema('governance').from('lineage_column_mappings').delete().eq('transformation_id', data.id)
    if (deleteError) throw new Error(`Unable to refresh column lineage mappings: ${deleteError.message}`)
    const rows = t.columnMappings.map((mapping) => ({
      project_id: projectId,
      transformation_id: data.id,
      source_asset_id: mapping.sourceAsset ? inputByName.get(mapping.sourceAsset.toLowerCase())?.id ?? inputAssets[0]?.id ?? null : inputAssets[0]?.id ?? null,
      source_column: mapping.sourceColumn || null,
      target_asset_id: mapping.targetAsset ? outputByName.get(mapping.targetAsset.toLowerCase())?.id ?? outputAssets[0]?.id ?? null : outputAssets[0]?.id ?? null,
      target_column: mapping.targetColumn || null,
      operation: mapping.operation || null,
      expression: mapping.expression || null,
      metadata: cleanObject(mapping.metadata),
    }))
    const { error: mappingError } = await admin.schema('governance').from('lineage_column_mappings').insert(rows)
    if (mappingError) throw new Error(`Unable to persist column lineage mappings: ${mappingError.message}`)
  }
  return data
}

async function persistEvent(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  integrationId: string,
  event: NormalizedLineageEvent,
) {
  const { data: prior, error: priorError } = await admin.schema('governance').from('lineage_ingestion_events').select('id,edge_count,transformation_count,status,received_at').eq('project_id', projectId).eq('external_event_id', event.externalEventId).maybeSingle()
  if (priorError) throw new Error(`Unable to check lineage event idempotency: ${priorError.message}`)
  if (prior) return { reused: true, event: prior, edgeCount: Number(prior.edge_count ?? 0), transformationCount: Number(prior.transformation_count ?? 0) }

  const inputAssets = await Promise.all(event.inputs.map((item) => resolveAsset(admin, projectId, integrationId, item)))
  const outputAssets = await Promise.all(event.outputs.map((item) => resolveAsset(admin, projectId, integrationId, item)))
  const transformation = await persistTransformation(admin, projectId, integrationId, event, inputAssets, outputAssets)
  const edgeRows: Array<Record<string, unknown>> = []
  const runMetadata = {
    external_event_id: event.externalEventId,
    event_type: event.eventType,
    job_namespace: event.jobNamespace,
    job_name: event.jobName,
    auto_discovered: true,
    integration_id: integrationId,
    transformation_id: transformation?.id ?? null,
    operation: transformation?.operation ?? null,
    logic_hash: transformation?.logic_hash ?? null,
  }

  if (inputAssets.length && outputAssets.length) {
    for (const source of inputAssets) for (const target of outputAssets) edgeRows.push({
      project_id: projectId,
      source_type: source.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
      source_id: source.dataset_id ?? source.id,
      target_type: target.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
      target_id: target.dataset_id ?? target.id,
      relationship: 'TRANSFORMS_TO',
      transformation_id: transformation?.id ?? null,
      metadata: runMetadata,
    })
  }

  if (edgeRows.length) {
    const { error: edgeError } = await admin.schema('governance').from('lineage_edges').upsert(edgeRows, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship', ignoreDuplicates: false })
    if (edgeError) throw new Error(`Unable to persist lineage edges: ${edgeError.message}`)
  }

  const { data: eventRow, error: eventError } = await admin.schema('governance').from('lineage_ingestion_events').insert({
    project_id: projectId,
    integration_id: integrationId,
    external_event_id: event.externalEventId,
    event_type: event.eventType,
    job_namespace: event.jobNamespace,
    job_name: event.jobName,
    payload_hash: hashPayload(event),
    edge_count: edgeRows.length,
    transformation_count: transformation ? 1 : 0,
    status: 'COMPLETED',
  }).select('*').single()
  if (eventError || !eventRow) throw new Error(`Unable to persist lineage ingestion event: ${eventError?.message ?? 'unknown error'}`)

  return { reused: false, event: eventRow, inputAssets, outputAssets, transformation, edgeCount: edgeRows.length, transformationCount: transformation ? 1 : 0 }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = text(new URL(request.url).searchParams.get('projectId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'lineage.read')
    const admin = createAdminClient()
    const [integrations, events, assets, transformations] = await Promise.all([
      admin.schema('governance').from('lineage_integrations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      admin.schema('governance').from('lineage_ingestion_events').select('*').eq('project_id', projectId).order('received_at', { ascending: false }).limit(100),
      admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id,last_seen_at').eq('project_id', projectId).order('last_seen_at', { ascending: false }).limit(500),
      admin.schema('governance').from('lineage_transformations').select('id,integration_id,external_id,source_system,name,operation,logic_language,logic_hash,last_seen_at').eq('project_id', projectId).order('last_seen_at', { ascending: false }).limit(500),
    ])
    const firstError = [integrations.error, events.error, assets.error, transformations.error].find(Boolean)
    if (firstError) throw new Error(firstError.message)
    return NextResponse.json({ integrations: integrations.data ?? [], events: events.data ?? [], assets: assets.data ?? [], transformations: transformations.data ?? [] })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load lineage ingestion state.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json() as Record<string, unknown>
    const projectId = text(body.projectId ?? body.project_id)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'lineage.manage')

    const normalized = normalizeLineagePayload(body)
    if (!normalized.events.length) return NextResponse.json({ error: 'No usable lineage relationships or transformation records were found in the payload.' }, { status: 400 })

    const sourceKey = text(body.sourceKey ?? body.source_key) || normalized.sourceSystem.toLowerCase()
    const sourceName = text(body.sourceName ?? body.source_name) || sourceKey
    const admin = createAdminClient()
    const { data: integration, error: integrationError } = await admin.schema('governance').from('lineage_integrations').upsert({
      project_id: projectId,
      source_key: sourceKey,
      name: sourceName,
      integration_type: normalized.sourceSystem,
      enabled: true,
      created_by: user.id,
    }, { onConflict: 'project_id,source_key' }).select('id').single()
    if (integrationError || !integration) throw new Error(`Unable to register lineage integration: ${integrationError?.message ?? 'unknown error'}`)

    const results = []
    for (const event of normalized.events) results.push(await persistEvent(admin, projectId, integration.id, event))
    const edgeCount = results.reduce((sum, result) => sum + result.edgeCount, 0)
    const transformationCount = results.reduce((sum, result) => sum + result.transformationCount, 0)
    const reusedCount = results.filter((result) => result.reused).length

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      eventType: 'LINEAGE_BATCH_INGESTED',
      entityType: 'PROJECT',
      entityId: projectId,
      metadata: { source_key: sourceKey, source_system: normalized.sourceSystem, event_count: results.length, reused_count: reusedCount, edge_count: edgeCount, transformation_count: transformationCount },
    })

    return NextResponse.json({
      accepted: true,
      sourceSystem: normalized.sourceSystem,
      eventCount: results.length,
      reusedCount,
      edgeCount,
      transformationCount,
      results,
    }, { status: reusedCount === results.length ? 200 : 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ingest lineage event.' }, { status: 500 })
  }
}
