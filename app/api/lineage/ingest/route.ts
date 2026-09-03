import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type AssetInput = { namespace?: unknown; name?: unknown; assetType?: unknown; datasetId?: unknown; facets?: unknown; metadata?: unknown }

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function cleanObject(value: unknown) {
  const source = object(value)
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/(password|secret|token|credential|authorization|api.?key)/i.test(key)).slice(0, 50))
}
function hashPayload(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

function normalizeAsset(value: unknown): AssetInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const name = text(row.name)
  if (!name) return null
  return {
    namespace: text(row.namespace),
    name,
    assetType: text(row.assetType ?? row.type) || 'DATASET',
    datasetId: text(row.datasetId ?? row.dataset_id),
    facets: row.facets,
    metadata: row.metadata,
  }
}

async function resolveAsset(admin: ReturnType<typeof createAdminClient>, projectId: string, integrationId: string, input: AssetInput) {
  const namespace = text(input.namespace)
  const name = text(input.name)
  const assetType = (text(input.assetType) || 'DATASET').toUpperCase()
  let datasetId = text(input.datasetId) || null

  if (datasetId) {
    const { data: dataset } = await admin.schema('catalog').from('datasets').select('id').eq('id', datasetId).eq('project_id', projectId).maybeSingle()
    if (!dataset) datasetId = null
  }
  if (!datasetId) {
    const [{ data: byName, error: byNameError }, { data: byIdentifier, error: byIdentifierError }] = await Promise.all([
      admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('name', name).limit(2),
      admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('source_identifier', name).limit(2),
    ])
    if (byNameError) throw new Error(`Unable to resolve lineage dataset name: ${byNameError.message}`)
    if (byIdentifierError) throw new Error(`Unable to resolve lineage source identifier: ${byIdentifierError.message}`)
    const matches = new Map<string, string>()
    for (const row of [...(byName ?? []), ...(byIdentifier ?? [])]) matches.set(row.id, row.id)
    if (matches.size === 1) datasetId = [...matches.keys()][0]
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

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = text(new URL(request.url).searchParams.get('projectId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'lineage.read')
    const admin = createAdminClient()
    const [integrations, events, assets] = await Promise.all([
      admin.schema('governance').from('lineage_integrations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      admin.schema('governance').from('lineage_ingestion_events').select('*').eq('project_id', projectId).order('received_at', { ascending: false }).limit(100),
      admin.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id,last_seen_at').eq('project_id', projectId).order('last_seen_at', { ascending: false }).limit(500),
    ])
    const firstError = [integrations.error, events.error, assets.error].find(Boolean)
    if (firstError) throw new Error(firstError.message)
    return NextResponse.json({ integrations: integrations.data ?? [], events: events.data ?? [], assets: assets.data ?? [] })
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

    const sourceKey = text(body.sourceKey ?? body.source_key) || 'openlineage-api'
    const sourceName = text(body.sourceName ?? body.source_name) || sourceKey
    const externalEventId = text(body.eventId ?? body.event_id ?? object(body.run).runId ?? object(body.run).run_id) || crypto.randomUUID()
    const eventType = text(body.eventType ?? body.event_type) || 'COMPLETE'
    const job = object(body.job)
    const inputs = (Array.isArray(body.inputs) ? body.inputs : []).map(normalizeAsset).filter((item): item is AssetInput => Boolean(item))
    const outputs = (Array.isArray(body.outputs) ? body.outputs : []).map(normalizeAsset).filter((item): item is AssetInput => Boolean(item))
    if (!inputs.length && !outputs.length) return NextResponse.json({ error: 'At least one lineage input or output asset is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: prior, error: priorError } = await admin.schema('governance').from('lineage_ingestion_events').select('id,edge_count,status,received_at').eq('project_id', projectId).eq('external_event_id', externalEventId).maybeSingle()
    if (priorError) throw new Error(`Unable to check lineage event idempotency: ${priorError.message}`)
    if (prior) return NextResponse.json({ accepted: true, reused: true, event: prior })

    const { data: integration, error: integrationError } = await admin.schema('governance').from('lineage_integrations').upsert({
      project_id: projectId,
      source_key: sourceKey,
      name: sourceName,
      integration_type: text(body.integrationType ?? body.integration_type) || 'OPENLINEAGE',
      enabled: true,
      created_by: user.id,
    }, { onConflict: 'project_id,source_key' }).select('id').single()
    if (integrationError || !integration) throw new Error(`Unable to register lineage integration: ${integrationError?.message ?? 'unknown error'}`)

    const inputAssets = await Promise.all(inputs.map((item) => resolveAsset(admin, projectId, integration.id, item)))
    const outputAssets = await Promise.all(outputs.map((item) => resolveAsset(admin, projectId, integration.id, item)))
    const edgeRows: Array<Record<string, unknown>> = []
    const runMetadata = { external_event_id: externalEventId, event_type: eventType, job_namespace: text(job.namespace), job_name: text(job.name), auto_discovered: true, integration_id: integration.id }

    if (inputAssets.length && outputAssets.length) {
      for (const source of inputAssets) for (const target of outputAssets) edgeRows.push({
        project_id: projectId,
        source_type: source.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        source_id: source.dataset_id ?? source.id,
        target_type: target.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        target_id: target.dataset_id ?? target.id,
        relationship: 'TRANSFORMS_TO',
        metadata: runMetadata,
      })
    }

    if (edgeRows.length) {
      const { error: edgeError } = await admin.schema('governance').from('lineage_edges').upsert(edgeRows, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship', ignoreDuplicates: false })
      if (edgeError) throw new Error(`Unable to persist lineage edges: ${edgeError.message}`)
    }

    const { data: event, error: eventError } = await admin.schema('governance').from('lineage_ingestion_events').insert({
      project_id: projectId,
      integration_id: integration.id,
      external_event_id: externalEventId,
      event_type: eventType,
      job_namespace: text(job.namespace) || null,
      job_name: text(job.name) || null,
      payload_hash: hashPayload(body),
      edge_count: edgeRows.length,
      status: 'COMPLETED',
    }).select('*').single()
    if (eventError || !event) throw new Error(`Unable to persist lineage ingestion event: ${eventError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({ projectId, actorUserId: user.id, eventType: 'LINEAGE_EVENT_INGESTED', entityType: 'PROJECT', entityId: projectId, metadata: { lineage_event_id: event.id, external_event_id: externalEventId, source_key: sourceKey, input_count: inputAssets.length, output_count: outputAssets.length, edge_count: edgeRows.length } })
    return NextResponse.json({ accepted: true, reused: false, event, inputAssets, outputAssets, edgeCount: edgeRows.length }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ingest lineage event.' }, { status: 500 })
  }
}
