import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  const user = await requireUser()
  const body = await request.json()
  const projectId = text(body.projectId)
  const labelId = text(body.labelId)
  const targetType = text(body.targetType).toUpperCase() || 'DATASET'
  const datasetId = text(body.datasetId)
  const discoveredAssetId = text(body.discoveredAssetId)
  const columnName = text(body.columnName)
  const confidence = typeof body.confidence === 'number' ? body.confidence : null

  if (!projectId || !labelId || !['DATASET', 'CATALOG_ASSET'].includes(targetType)) {
    return NextResponse.json({ error: 'projectId, labelId and a supported targetType are required.' }, { status: 400 })
  }
  if (targetType === 'DATASET' && !datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })
  if (targetType === 'CATALOG_ASSET' && !discoveredAssetId) return NextResponse.json({ error: 'discoveredAssetId is required.' }, { status: 400 })

  try {
    await authorizeProject(user.id, projectId, 'classification.review')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const admin = createAdminClient()
  let sourceId: string | null = null
  let identityKey: string | null = null
  if (targetType === 'CATALOG_ASSET') {
    const { data: asset, error: assetError } = await admin.schema('catalog').from('discovered_assets')
      .select('id,source_id,identity_key,data_sources!inner(project_id)')
      .eq('id', discoveredAssetId).eq('is_current', true).eq('data_sources.project_id', projectId).maybeSingle()
    if (assetError || !asset?.identity_key) return NextResponse.json({ error: assetError?.message ?? 'Current governed catalog asset not found.' }, { status: 400 })
    sourceId = asset.source_id
    identityKey = asset.identity_key
  }

  const { data, error } = await admin.schema('governance').rpc('propose_classification', {
    p_project_id: projectId,
    p_actor: user.id,
    p_label_id: labelId,
    p_target_type: targetType,
    p_dataset_id: targetType === 'DATASET' ? datasetId : null,
    p_data_source_id: sourceId,
    p_catalog_identity_key: identityKey,
    p_column_name: columnName || null,
    p_origin: 'HUMAN_APPROVED',
    p_confidence: confidence,
    p_evidence: { created_via: 'WEB_UI', authority_boundary: 'HUMAN_REVIEW_REQUIRED' },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ classification: data }, { status: 201 })
}
