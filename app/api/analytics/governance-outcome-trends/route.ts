import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { loadGovernanceOutcomeHistory } from '@/lib/analytics/governance-outcome-history'

function text(value: string | null) {
  return value?.trim() ?? ''
}

function optionalTimestamp(value: string | null, name: string) {
  const normalized = text(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be a valid timestamp`)
  return parsed.toISOString()
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const from = optionalTimestamp(url.searchParams.get('from'), 'from')
    const to = optionalTimestamp(url.searchParams.get('to'), 'to')
    const limit = Number(url.searchParams.get('limit') ?? 1000)

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      return NextResponse.json({ error: 'from must be earlier than or equal to to.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.view')
    const result = await loadGovernanceOutcomeHistory({
      projectId,
      from,
      to,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to load governance outcome history.'
    return NextResponse.json({ error: message }, { status: /valid timestamp/.test(message) ? 400 : 500 })
  }
}
