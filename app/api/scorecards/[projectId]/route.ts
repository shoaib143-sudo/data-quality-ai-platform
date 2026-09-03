import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser()
    const { projectId } = await params
    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()

    const { data: latest, error: latestError } = await admin
      .schema('governance')
      .from('project_scorecard_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw new Error(`Unable to load governance scorecard: ${latestError.message}`)

    const stale = !latest || Date.now() - new Date(latest.calculated_at).getTime() > 15 * 60_000
    if (stale) {
      const { data, error } = await admin.schema('governance').rpc('refresh_project_scorecard', { p_project_id: projectId })
      if (error) throw new Error(`Unable to refresh governance scorecard: ${error.message}`)
      return NextResponse.json({ scorecard: data, refreshed: true })
    }

    const { data: history, error: historyError } = await admin
      .schema('governance')
      .from('project_scorecard_snapshots')
      .select('id,overall_score,dimensions,evidence,calculated_at')
      .eq('project_id', projectId)
      .order('calculated_at', { ascending: false })
      .limit(24)
    if (historyError) throw new Error(`Unable to load governance scorecard history: ${historyError.message}`)

    return NextResponse.json({ scorecard: latest, history: history ?? [], refreshed: false })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load governance scorecard.' }, { status: 500 })
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser()
    const { projectId } = await params
    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('refresh_project_scorecard', { p_project_id: projectId })
    if (error) throw new Error(`Unable to refresh governance scorecard: ${error.message}`)
    return NextResponse.json({ scorecard: data })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to refresh governance scorecard.' }, { status: 500 })
  }
}
