import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { evaluateLineageChangeGate } from '@/lib/governance/lineage-change-gate'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const { searchParams } = new URL(request.url)
    const analysisId = text(searchParams.get('analysisId'))
    if (!analysisId) return NextResponse.json({ error: 'analysisId is required.' }, { status: 400 })

    const gate = await evaluateLineageChangeGate(analysisId)
    await authorizeProject(user.id, gate.projectId, 'lineage.read')

    return NextResponse.json({ gate })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Unable to evaluate lineage change gate.'
    const status = message === 'Lineage impact analysis not found.' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
