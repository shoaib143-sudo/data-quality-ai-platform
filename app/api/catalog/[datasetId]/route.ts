import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const allowedLifecycleStatuses = new Set(['ACTIVE', 'DEPRECATED', 'ARCHIVED'])
const allowedCriticalities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ datasetId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { datasetId } = await params
    const { authorization, dataset } = await authorizeDataset(user.id, datasetId, 'catalog.update')
    const body = await request.json()

    if ('certificationStatus' in body || 'certifiedAt' in body || 'certifiedBy' in body) {
      return NextResponse.json(
        { error: 'Certification state is managed through the certification workflow.' },
        { status: 400 },
      )
    }

    const lifecycleStatus = String(body.lifecycleStatus ?? 'ACTIVE').toUpperCase()
    const criticality = String(body.criticality ?? 'MEDIUM').toUpperCase()
    if (!allowedLifecycleStatuses.has(lifecycleStatus)) {
      return NextResponse.json({ error: 'Invalid lifecycleStatus.' }, { status: 400 })
    }
    if (!allowedCriticalities.has(criticality)) {
      return NextResponse.json({ error: 'Invalid criticality.' }, { status: 400 })
    }

    const payload = {
      dataset_id: datasetId,
      project_id: dataset.project_id,
      technical_owner_user_id: body.technicalOwnerUserId || null,
      business_owner_user_id: body.businessOwnerUserId || null,
      steward_user_id: body.stewardUserId || null,
      lifecycle_status: lifecycleStatus,
      criticality,
      tags: Array.isArray(body.tags)
        ? body.tags.map(String).map((value: string) => value.trim()).filter(Boolean)
        : [],
      business_description:
        typeof body.businessDescription === 'string' ? body.businessDescription.trim() || null : null,
      retention_days: Number.isFinite(Number(body.retentionDays)) ? Number(body.retentionDays) : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      updated_at: new Date().toISOString(),
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('governance')
      .from('dataset_catalog')
      .upsert(payload, { onConflict: 'dataset_id' })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await writeGovernanceAudit({
      projectId: authorization.projectId,
      actorUserId: user.id,
      eventType: 'CATALOG_METADATA_UPDATED',
      entityType: 'DATASET',
      entityId: datasetId,
      metadata: {
        lifecycle_status: payload.lifecycle_status,
        criticality: payload.criticality,
        tags: payload.tags,
      },
    })

    return NextResponse.json({ catalog: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    throw error
  }
}
