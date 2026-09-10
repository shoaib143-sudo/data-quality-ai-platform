import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
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
      .rpc('request_dataset_certification', {
        p_project_id: projectId,
        p_dataset_id: datasetId,
        p_actor_user_id: user.id,
        p_assigned_to: body.assignedTo || null,
        p_evidence: body.evidence ?? {},
      })
      .single()

    if (error) {
      const status = error.code === '23505' ? 409 : error.code === '42501' ? 403 : 400
      return NextResponse.json({ error: error.message }, { status })
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
