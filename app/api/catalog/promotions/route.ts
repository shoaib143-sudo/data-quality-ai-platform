import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function requestContext(requestId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').from('asset_promotion_requests').select('id,project_id,source_id,identity_key,status,dataset_id').eq('id', requestId).maybeSingle()
  if (error) throw new Error(`Unable to resolve asset promotion request: ${error.message}`)
  if (!data) throw new AuthorizationError('Asset promotion request was not found.', 404)
  return data
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'catalog.read')
    const admin = createAdminClient()
    const [{ data: requests, error: requestsError }, { data: trust, error: trustError }] = await Promise.all([
      admin.schema('catalog').from('asset_promotion_requests').select('id,project_id,source_id,identity_key,discovered_asset_id,status,recommendation_source,confidence,rationale,recommendations,requested_by,requested_at,decided_by,decided_at,decision_reason,dataset_id,created_at,updated_at').eq('project_id', projectId).order('updated_at', { ascending: false }),
      admin.schema('catalog').from('current_asset_trust').select('project_id,source_id,scope_id,identity_key,asset_key,presence_state,last_seen_at,discovered_asset_id,namespace,name,trust_score,dimensions,explanation,certification_state').eq('project_id', projectId).order('trust_score', { ascending: true }),
    ])
    if (requestsError) throw new Error(`Unable to load asset promotion requests: ${requestsError.message}`)
    if (trustError) throw new Error(`Unable to load physical asset trust: ${trustError.message}`)
    return NextResponse.json({ requests: requests ?? [], trust: trust ?? [] })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load asset promotions.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const action = text(body.action).toUpperCase()
    const admin = createAdminClient()

    if (action === 'REQUEST') {
      const projectId = text(body.projectId)
      const sourceId = text(body.sourceId)
      const identityKey = text(body.identityKey)
      const rationale = text(body.rationale) || null
      if (!projectId || !sourceId || !identityKey) return NextResponse.json({ error: 'projectId, sourceId, and identityKey are required.' }, { status: 400 })
      await authorizeProject(user.id, projectId, 'catalog.update')
      const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id,project_id').eq('id', sourceId).eq('project_id', projectId).maybeSingle()
      if (sourceError || !source) return NextResponse.json({ error: 'Source not found in the project.' }, { status: 404 })
      const { data, error } = await admin.schema('catalog').rpc('create_asset_promotion_request', {
        p_source_id: sourceId,
        p_identity_key: identityKey,
        p_actor: user.id,
        p_rationale: rationale,
      })
      if (error) throw new Error(`Unable to request governed asset promotion: ${error.message}`)
      return NextResponse.json({ requestId: data, status: 'REQUESTED' })
    }

    const requestId = text(body.requestId)
    if (!requestId) return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
    const promotion = await requestContext(requestId)

    if (action === 'DECIDE') {
      await authorizeProject(user.id, promotion.project_id, 'stewardship.manage')
      const decision = text(body.decision).toUpperCase()
      if (!['APPROVED', 'REJECTED'].includes(decision)) return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
      const { error } = await admin.schema('catalog').rpc('decide_asset_promotion', {
        p_request_id: requestId,
        p_actor: user.id,
        p_decision: decision,
        p_reason: text(body.reason) || null,
      })
      if (error) throw new Error(`Unable to decide asset promotion: ${error.message}`)
      return NextResponse.json({ requestId, status: decision })
    }

    if (action === 'PROMOTE') {
      await authorizeProject(user.id, promotion.project_id, 'stewardship.manage')
      const { data, error } = await admin.schema('catalog').rpc('promote_approved_asset', {
        p_request_id: requestId,
        p_actor: user.id,
      })
      if (error) throw new Error(`Unable to promote governed asset: ${error.message}`)
      return NextResponse.json({ requestId, status: 'PROMOTED', datasetId: data })
    }

    return NextResponse.json({ error: 'Unsupported promotion action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Asset promotion action failed.' }, { status: 500 })
  }
}
