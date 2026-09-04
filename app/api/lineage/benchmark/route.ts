import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { benchmarkGraphProvider } from '@/lib/data-plane/graph-benchmark'
import type { GraphDirection } from '@/lib/data-plane/contracts'

const ALLOWED_TYPES = new Set([
  'DATA_SOURCE',
  'DATASET',
  'DATASET_VERSION',
  'PROFILE_RUN',
  'AGENT_RUN',
  'EXTERNAL_ASSET',
])

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const anchorType = (url.searchParams.get('anchorType') ?? '').trim().toUpperCase()
    const anchorId = (url.searchParams.get('anchorId') ?? '').trim()
    const directionRaw = (url.searchParams.get('direction') ?? 'BOTH').trim().toUpperCase()
    const direction: GraphDirection = ['UPSTREAM', 'DOWNSTREAM', 'BOTH'].includes(directionRaw)
      ? directionRaw as GraphDirection
      : 'BOTH'
    const depth = boundedInt(url.searchParams.get('depth'), 2, 1, 4)
    const maxEdges = boundedInt(url.searchParams.get('maxEdges'), 200, 10, 400)
    const iterations = boundedInt(url.searchParams.get('iterations'), 7, 3, 25)
    const warmupIterations = boundedInt(url.searchParams.get('warmupIterations'), 1, 0, 5)

    if (!validUuid(projectId) || !validUuid(anchorId)) {
      return NextResponse.json({ error: 'Valid projectId and anchorId UUIDs are required.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(anchorType)) {
      return NextResponse.json({ error: `Unsupported anchorType. Allowed values: ${[...ALLOWED_TYPES].join(', ')}` }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'lineage.manage')
    const result = await benchmarkGraphProvider({
      projectId,
      anchor: { type: anchorType, id: anchorId },
      direction,
      depth,
      maxEdges,
      iterations,
      warmupIterations,
    })
    return NextResponse.json(result)
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('GraphProvider benchmark failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to benchmark GraphProvider.' }, { status: 500 })
  }
}
