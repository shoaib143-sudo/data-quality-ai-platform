import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { assessProposedLineageChange } from '@/lib/governance/lineage-change-impact'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function integer(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}
function stringList(value: unknown) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => text(item)).filter(Boolean))].slice(0, 50)
  if (typeof value === 'string') return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))].slice(0, 50)
  return []
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const datasetId = text(body.datasetId)
    const changeType = text(body.changeType).toUpperCase() || 'PIPELINE_LOGIC_CHANGE'
    if (!projectId || !datasetId) return NextResponse.json({ error: 'projectId and datasetId are required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'lineage.read')
    const result = await assessProposedLineageChange({
      projectId,
      datasetId,
      changeType,
      changeSummary: text(body.changeSummary) || null,
      affectedColumns: stringList(body.affectedColumns),
      maxDepth: integer(body.maxDepth, 4),
      maxEdges: integer(body.maxEdges, 240),
      actorUserId: user.id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to assess proposed lineage change.' }, { status: 500 })
  }
}
