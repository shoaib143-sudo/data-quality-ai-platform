import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError, type AuthorizationCapability } from '@/lib/auth/authorize'
import { getAnalyticsQueryProvider } from '@/lib/data-plane/analytics-query-provider'

const supportedMetrics = new Set([
  'profiling.run_history',
  'profiling.metric_history',
  'profiling.finding_history',
  'dq.score_history',
])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function capabilityFor(metric: string): AuthorizationCapability {
  return metric === 'dq.score_history' ? 'quality.read' : 'profiling.read'
}

function filters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const allowed = new Set(['datasetId', 'datasetVersionId', 'profileRunId', 'metricKey', 'severity', 'findingType', 'status'])
  const output: Record<string, string | number | boolean | null> = {}
  for (const [key, filterValue] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) throw new Error(`Unsupported analytics filter: ${key}`)
    if (filterValue == null || ['string', 'number', 'boolean'].includes(typeof filterValue)) {
      output[key] = filterValue as string | number | boolean | null
      continue
    }
    throw new Error(`Analytics filter ${key} must be a scalar value`)
  }
  return output
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const metric = text(body.metric)
    if (!projectId || !metric) return NextResponse.json({ error: 'projectId and metric are required.' }, { status: 400 })
    if (!supportedMetrics.has(metric)) return NextResponse.json({ error: `Unsupported analytics metric: ${metric}` }, { status: 400 })

    await authorizeProject(user.id, projectId, capabilityFor(metric))

    const provider = getAnalyticsQueryProvider()
    const rows = await provider.query({
      projectId,
      metric,
      from: text(body.from) || null,
      to: text(body.to) || null,
      filters: filters(body.filters),
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    })

    return NextResponse.json({
      provider: provider.providerKey,
      metric,
      projectId,
      count: rows.length,
      rows,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analytics query failed.' }, { status: 500 })
  }
}
