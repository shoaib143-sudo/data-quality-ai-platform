import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGraphProvider } from '@/lib/data-plane/graph-provider'
import type { GraphDirection } from '@/lib/data-plane/contracts'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const ALLOWED_TYPES = new Set([
  'DATA_SOURCE',
  'DATASET',
  'DATASET_VERSION',
  'PROFILE_RUN',
  'AGENT_RUN',
  'EXTERNAL_ASSET',
])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseDirection(value: string): GraphDirection {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'UPSTREAM' || normalized === 'DOWNSTREAM' || normalized === 'BOTH') return normalized
  return 'BOTH'
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(password|secret|token|credential|authorization|api.?key|private.?key)/i.test(key))
      .slice(0, 100),
  )
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const anchorType = text(url.searchParams.get('anchorType')).toUpperCase()
    const anchorId = text(url.searchParams.get('anchorId') ?? url.searchParams.get('entityId'))
    const direction = parseDirection(text(url.searchParams.get('direction')) || 'BOTH')
    const depth = parseBoundedInt(url.searchParams.get('depth'), 2, 1, 4)
    const maxEdges = parseBoundedInt(url.searchParams.get('maxEdges'), 200, 10, 400)

    if (!validUuid(projectId) || !validUuid(anchorId)) {
      return NextResponse.json({ error: 'Valid projectId and anchorId UUIDs are required.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(anchorType)) {
      return NextResponse.json({
        error: `anchorType is required. Allowed values: ${[...ALLOWED_TYPES].join(', ')}`,
        migration: 'Use GET /api/lineage/neighborhood for bounded traversal.',
      }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'lineage.read')
    const result = await getGraphProvider().neighborhood({
      projectId,
      anchor: { type: anchorType, id: anchorId },
      direction,
      depth,
      maxEdges,
    })

    return NextResponse.json({
      ...result,
      deprecatedRoute: '/api/lineage',
      preferredRoute: '/api/lineage/neighborhood',
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('Legacy lineage query failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to query lineage.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json() as Record<string, unknown>
    const projectId = text(body.projectId)
    const sourceType = text(body.sourceType).toUpperCase()
    const sourceId = text(body.sourceId)
    const targetType = text(body.targetType).toUpperCase()
    const targetId = text(body.targetId)
    const relationship = text(body.relationship).toUpperCase()

    if (!validUuid(projectId) || !validUuid(sourceId) || !validUuid(targetId) || !sourceType || !targetType || !relationship) {
      return NextResponse.json({ error: 'Valid projectId/sourceId/targetId UUIDs and complete lineage edge attributes are required.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(sourceType) || !ALLOWED_TYPES.has(targetType)) {
      return NextResponse.json({ error: `Unsupported lineage node type. Allowed values: ${[...ALLOWED_TYPES].join(', ')}` }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'lineage.manage')
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('lineage_edges').upsert({
      project_id: projectId,
      source_type: sourceType,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      relationship,
      metadata: { ...cleanMetadata(body.metadata), manual: true, created_by: user.id },
    }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship' }).select('*').single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Unable to persist lineage edge.' }, { status: 400 })

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      eventType: 'LINEAGE_EDGE_MANUALLY_UPSERTED',
      entityType: 'LINEAGE_EDGE',
      entityId: data.id,
      metadata: { source_type: sourceType, source_id: sourceId, target_type: targetType, target_id: targetId, relationship },
    })

    return NextResponse.json({ edge: data }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('Manual lineage edge upsert failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to persist lineage edge.' }, { status: 500 })
  }
}
