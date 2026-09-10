import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const validStatuses = new Set(['IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { requestId } = await params
    const admin = createAdminClient()

    const { data: certificationRequest, error: requestError } = await admin
      .schema('governance')
      .from('certification_requests')
      .select('id,project_id,dataset_id')
      .eq('id', requestId)
      .maybeSingle()

    if (requestError) {
      return NextResponse.json({ error: requestError.message }, { status: 400 })
    }
    if (!certificationRequest) {
      return NextResponse.json({ error: 'Certification request not found.' }, { status: 404 })
    }

    await authorizeProject(user.id, certificationRequest.project_id, 'certification.review')

    const body = await request.json()
    const status = String(body.status ?? '').toUpperCase()
    if (!validStatuses.has(status)) {
      return NextResponse.json({ error: 'Invalid certification status.' }, { status: 400 })
    }

    const { data, error } = await admin
      .schema('governance')
      .rpc('review_dataset_certification', {
        p_request_id: requestId,
        p_actor_user_id: user.id,
        p_status: status,
        p_decision_notes: typeof body.decisionNotes === 'string' ? body.decisionNotes : null,
        p_assigned_to: body.assignedTo || null,
      })
      .single()

    if (error) {
      const responseStatus = error.code === '23514' ? 409 : error.code === '42501' ? 403 : 400
      return NextResponse.json({ error: error.message }, { status: responseStatus })
    }

    await writeGovernanceAudit({
      projectId: certificationRequest.project_id,
      actorUserId: user.id,
      eventType: `CERTIFICATION_${status}`,
      entityType: 'CERTIFICATION_REQUEST',
      entityId: requestId,
      metadata: { datasetId: certificationRequest.dataset_id },
    })

    return NextResponse.json({ request: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    throw error
  }
}
