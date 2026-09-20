import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { loadDataQualityHistory } from '@/lib/analytics/data-quality-history'
import { getAnalyticsQueryProvider } from '@/lib/data-plane/analytics-query-provider'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalTimestamp(value: unknown, name: string) {
  const normalized = text(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be a valid timestamp`)
  return parsed.toISOString()
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const datasetId = text(body.datasetId) || null
    const from = optionalTimestamp(body.from, 'from')
    const to = optionalTimestamp(body.to, 'to')

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      return NextResponse.json({ error: 'from must be earlier than or equal to to.' }, { status: 400 })
    }

    const threshold = body.changeThreshold === undefined ? undefined : Number(body.changeThreshold)
    if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0)) {
      return NextResponse.json({ error: 'changeThreshold must be a finite non-negative number.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'quality.read')
    const result = await loadDataQualityHistory({
      projectId,
      datasetId,
      from,
      to,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      changeThreshold: threshold,
    }, getAnalyticsQueryProvider())

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Unable to load Data Quality history.'
    const status = /must be a valid timestamp/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
