import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { getFieldGraphProvider } from '@/lib/data-plane/field-graph-provider'
import type { GraphDirection } from '@/lib/data-plane/contracts'

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number.parseInt(value, 10) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function direction(value: string | null): GraphDirection {
  const normalized = (value ?? 'BOTH').trim().toUpperCase()
  return normalized === 'UPSTREAM' || normalized === 'DOWNSTREAM' || normalized === 'BOTH' ? normalized : 'BOTH'
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const assetId = (url.searchParams.get('assetId') ?? '').trim()
    const columnName = (url.searchParams.get('columnName') ?? '').trim()
    const requestedDirection = direction(url.searchParams.get('direction'))
    const depth = boundedInt(url.searchParams.get('depth'), 2, 1, 4)
    const maxEdges = boundedInt(url.searchParams.get('maxEdges'), 120, 10, 300)

    if (!validUuid(projectId) || !validUuid(assetId)) {
      return NextResponse.json({ error: 'Valid projectId and assetId UUIDs are required.' }, { status: 400 })
    }
    if (!columnName || columnName.length > 512) {
      return NextResponse.json({ error: 'columnName is required and must be 512 characters or fewer.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'lineage.read')
    const provider = getFieldGraphProvider()
    const result = await provider.fieldNeighborhood({
      projectId,
      anchor: { assetId, columnName },
      direction: requestedDirection,
      depth,
      maxEdges,
    })

    return NextResponse.json({ ...result, provider: provider.providerKey })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    console.error('Field lineage neighborhood query failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to query field lineage neighborhood.' }, { status: 500 })
  }
}
