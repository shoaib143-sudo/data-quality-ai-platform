import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeLineagePayload } from '@/lib/governance/lineage-adapters'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function hashPayload(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

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
    // Idempotency remains keyed by each normalized externalEventId; the atomic RPC persists TRANSFORMS_TO edges and the audit in one transaction.
    const events = normalized.events.map((event) => ({ ...event, payloadHash: hashPayload(event) }))
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('ingest_lineage_batch_atomic', {
      p_project_id: projectId,
      p_actor: user.id,
      p_source_key: sourceKey,
      p_source_name: sourceName,
      p_source_system: normalized.sourceSystem,
      p_events: events,
    })
    if (error) throw new Error(`Unable to persist atomic lineage batch: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Atomic lineage ingestion did not confirm transactional audit and database authorization.')
    }

    const eventCount = Number(data.eventCount ?? 0)
    const reusedCount = Number(data.reusedCount ?? 0)
    return NextResponse.json(data, { status: eventCount > 0 && reusedCount === eventCount ? 200 : 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ingest lineage event.' }, { status: 500 })
  }
}
