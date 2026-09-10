import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { assessGovernedLineageChange } from '@/lib/governance/lineage-change-governance'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function integer(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const datasetId = text(body.datasetId)
    const changeType = text(body.changeType).toUpperCase()
    const affectedColumns = Array.isArray(body.affectedColumns)
      ? body.affectedColumns.map(text).filter(Boolean)
      : []

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })
    if (!changeType) return NextResponse.json({ error: 'changeType is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'lineage.read')
    const result = await assessGovernedLineageChange({
      projectId,
      datasetId,
      changeType,
      changeSummary: text(body.changeSummary) || null,
      affectedColumns,
      maxDepth: integer(body.maxDepth, 4),
      maxEdges: integer(body.maxEdges, 240),
      actorUserId: user.id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to assess governed lineage change.' }, { status: 500 })
  }
}
