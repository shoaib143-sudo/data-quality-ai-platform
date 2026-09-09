import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { runGovernanceRetrievalBenchmark } from '@/lib/ai/governance-retrieval-benchmark'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function benchmarkK(value: unknown) {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return null
  return parsed
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    const k = benchmarkK(body?.k)
    if (k === null) return NextResponse.json({ error: 'k must be an integer between 1 and 100.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'admin.manage')
    const result = await runGovernanceRetrievalBenchmark({ projectId, ...(k ? { k } : {}) })

    return NextResponse.json({ accepted: true, result }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to run governed retrieval benchmark.'
    if (message.includes('No governed retrieval relevance labels are available')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
