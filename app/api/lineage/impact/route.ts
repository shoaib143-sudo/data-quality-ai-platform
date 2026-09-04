import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzeLineageImpact } from '@/lib/governance/lineage-impact'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function integer(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}
function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const analysisId = text(url.searchParams.get('analysisId'))
    const rootAssetId = text(url.searchParams.get('rootAssetId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'lineage.read')

    const admin = createAdminClient()
    if (analysisId) {
      const { data: analysis, error: analysisError } = await admin.schema('governance').from('lineage_impact_analyses')
        .select('*').eq('project_id', projectId).eq('id', analysisId).maybeSingle()
      if (analysisError) throw new Error(`Unable to load lineage impact analysis: ${analysisError.message}`)
      if (!analysis) return NextResponse.json({ error: 'Lineage impact analysis not found.' }, { status: 404 })
      const { data: nodes, error: nodesError } = await admin.schema('governance').from('lineage_impact_nodes')
        .select('*').eq('analysis_id', analysisId).order('risk_score', { ascending: false }).order('distance', { ascending: true }).limit(1000)
      if (nodesError) throw new Error(`Unable to load lineage impact nodes: ${nodesError.message}`)
      return NextResponse.json({ analysis, nodes: nodes ?? [] })
    }

    let query = admin.schema('governance').from('lineage_impact_analyses').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
    if (rootAssetId) query = query.eq('root_asset_id', rootAssetId)
    const { data: analyses, error: analysesError } = await query
    if (analysesError) throw new Error(`Unable to load lineage impact analyses: ${analysesError.message}`)
    return NextResponse.json({ analyses: analyses ?? [] })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load lineage impact intelligence.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const rootAssetType = text(body.rootAssetType).toUpperCase() || 'DATASET'
    const rootAssetId = text(body.rootAssetId)
    const direction = text(body.direction).toUpperCase() === 'UPSTREAM' ? 'UPSTREAM' : 'DOWNSTREAM'
    if (!projectId || !rootAssetId) return NextResponse.json({ error: 'projectId and rootAssetId are required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'lineage.read')

    const result = await analyzeLineageImpact({
      projectId,
      rootAssetType,
      rootAssetId,
      rootAssetName: text(body.rootAssetName) || null,
      triggerType: text(body.triggerType) || 'USER_REQUEST',
      triggerId: text(body.triggerId) || null,
      direction,
      maxDepth: integer(body.maxDepth, 4),
      maxEdges: integer(body.maxEdges, 400),
      rootRiskScore: number(body.rootRiskScore),
      actorUserId: user.id,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to analyze lineage impact.' }, { status: 500 })
  }
}
