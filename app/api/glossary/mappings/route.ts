import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  const user = await requireUser()
  const body = await request.json()
  const termId = text(body.termId)
  const targetType = text(body.targetType).toUpperCase() || 'DATASET'
  if (!termId || !['DATASET', 'CATALOG_ASSET'].includes(targetType)) {
    return NextResponse.json({ error: 'termId and a valid targetType are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: term, error: termError } = await admin
    .schema('governance')
    .from('glossary_terms')
    .select('id,project_id,status,authority_type')
    .eq('id', termId)
    .maybeSingle()
  if (termError) return NextResponse.json({ error: termError.message }, { status: 500 })
  if (!term) return NextResponse.json({ error: 'Term not found.' }, { status: 404 })

  try {
    await authorizeProject(user.id, term.project_id, 'glossary.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const confidence = Number(body.confidence)
  const row: Record<string, unknown> = {
    term_id: term.id,
    target_type: targetType,
    dataset_id: targetType === 'DATASET' ? text(body.datasetId) || null : null,
    discovered_asset_id: targetType === 'CATALOG_ASSET' ? text(body.discoveredAssetId) || null : null,
    column_name: text(body.columnName) || null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    approved: false,
    approved_by: null,
    mapping_status: 'PROPOSED',
    origin: 'HUMAN',
    proposed_by: user.id,
    reviewed_by: null,
    reviewed_at: null,
    validation_state: targetType === 'CATALOG_ASSET' ? 'VALID' : 'UNVERIFIED',
    evidence: { created_via: 'WEB_UI', proposal_type: 'HUMAN' },
  }
  if (targetType === 'DATASET' && !row.dataset_id) return NextResponse.json({ error: 'datasetId is required for a dataset mapping.' }, { status: 400 })
  if (targetType === 'CATALOG_ASSET' && !row.discovered_asset_id) return NextResponse.json({ error: 'discoveredAssetId is required for a catalog mapping.' }, { status: 400 })

  const { data, error } = await admin.schema('governance').from('glossary_mappings').insert(row).select('*').single()
  if (error) {
    const message = error.code === '23505' ? 'This semantic mapping already exists.' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }

  await writeGovernanceAudit({
    projectId: term.project_id,
    actorUserId: user.id,
    eventType: 'GLOSSARY_MAPPING_PROPOSED',
    entityType: 'GLOSSARY_MAPPING',
    entityId: data.id,
    metadata: { term_id: term.id, target_type: targetType, validation_state: data.validation_state, origin: data.origin },
  })
  return NextResponse.json({ mapping: data }, { status: 201 })
}
