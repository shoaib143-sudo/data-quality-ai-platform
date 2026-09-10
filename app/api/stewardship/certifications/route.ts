import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = String(body.projectId ?? '')
    const datasetId = String(body.datasetId ?? '')

    if (!projectId || !datasetId) {
      return NextResponse.json({ error: 'projectId and datasetId are required.' }, { status: 400 })
    }

    const { authorization, dataset } = await authorizeDataset(user.id, datasetId, 'certification.request')
    if (authorization.projectId !== projectId || dataset.project_id !== projectId) {
      return NextResponse.json({ error: 'Dataset does not belong to the requested project.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('governance')
      .from('certification_requests')
      .insert({
        project_id: projectId,
        dataset_id: datasetId,
        requested_by: user.id,
        assigned_to: body.assignedTo || null,
        status: 'PENDING',
        evidence: body.evidence ?? {},
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { error: catalogError } = await admin
      .schema('governance')
      .from('dataset_catalog')
      .upsert(
        {
          dataset_id: datasetId,
          project_id: projectId,
          certification_status: 'PENDING',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dataset_id' },
      )

    if (catalogError) {
      return NextResponse.json({ error: `Certification was created but catalog synchronization failed: ${catalogError.message}` }, { status: 500 })
    }

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      eventType: 'CERTIFICATION_REQUESTED',
      entityType: 'CERTIFICATION_REQUEST',
      entityId: data.id,
      metadata: { datasetId },
    })

    return NextResponse.json({ request: data }, { status: 201 })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    throw error
  }
}
