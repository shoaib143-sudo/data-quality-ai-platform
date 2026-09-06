import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  const user = await requireUser()
  const body = await request.json()
  const projectId = text(body.projectId)
  const targetType = text(body.targetType).toUpperCase() || 'DATASET'
  const datasetId = text(body.datasetId)
  const discoveredAssetId = text(body.discoveredAssetId)
  const targetUserId = text(body.userId)
  const role = text(body.role).toUpperCase()
  const accountability = text(body.accountability)

  if (!projectId || !targetUserId || !['BUSINESS_OWNER', 'TECHNICAL_OWNER', 'DATA_STEWARD', 'CUSTODIAN'].includes(role)) {
    return NextResponse.json({ error: 'A project, organization member and supported stewardship role are required.' }, { status: 400 })
  }
  if (targetType === 'DATASET' && !datasetId) {
    return NextResponse.json({ error: 'datasetId is required for a dataset assignment.' }, { status: 400 })
  }
  if (targetType === 'CATALOG_ASSET' && !discoveredAssetId) {
    return NextResponse.json({ error: 'discoveredAssetId is required for a catalog asset assignment.' }, { status: 400 })
  }
  if (!['DATASET', 'CATALOG_ASSET'].includes(targetType)) {
    return NextResponse.json({ error: 'targetType must be DATASET or CATALOG_ASSET.' }, { status: 400 })
  }

  try {
    await authorizeProject(user.id, projectId, 'stewardship.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('stewardship_assignments')
    .insert({
      project_id: projectId,
      target_type: targetType,
      dataset_id: targetType === 'DATASET' ? datasetId : null,
      discovered_asset_id: targetType === 'CATALOG_ASSET' ? discoveredAssetId : null,
      user_id: targetUserId,
      role,
      accountability: accountability || null,
      status: 'ACTIVE',
      origin: 'HUMAN',
      assigned_by: user.id,
      assigned_at: new Date().toISOString(),
      last_changed_by: user.id,
      target_state: 'CURRENT',
      subject_state: 'CURRENT',
      evidence: { created_via: 'WEB_UI', authority: 'HUMAN_GOVERNED' },
    })
    .select('*')
    .single()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json({ error: duplicate ? 'An active assignment with this target, member and role already exists.' : error.message }, { status: 400 })
  }

  // Assignment evidence and audit are captured by DB triggers in this transaction.
  return NextResponse.json({ assignment: data }, { status: 201 })
}
