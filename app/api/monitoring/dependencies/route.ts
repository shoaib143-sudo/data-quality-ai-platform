import { NextResponse } from 'next/server'

import { AuthorizationError } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/auth/require-user'
import { loadMonitoringDependencyEvidence } from '@/lib/orchestration/monitoring-dependencies'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseIdList(value: string | null, limit: number) {
  if (!value) return []
  const ids = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  if (ids.length > limit || ids.some((id) => !UUID_PATTERN.test(id))) return null
  return ids
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectIds = parseIdList(url.searchParams.get('projectIds'), 25)
    const runIds = parseIdList(url.searchParams.get('runIds'), 50)

    if (!projectIds || !runIds) {
      return NextResponse.json({ error: 'Invalid monitoring dependency scope.' }, { status: 400 })
    }
    if (!projectIds.length || !runIds.length) return NextResponse.json({ dependencies: [] })

    const dependencies = await loadMonitoringDependencyEvidence({
      userId: user.id,
      projectIds,
      runIds,
    })
    return NextResponse.json({ dependencies })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[monitoring-dependencies] dependency evidence read failed', error)
    return NextResponse.json({ error: 'Unable to load monitoring dependencies.' }, { status: 500 })
  }
}
