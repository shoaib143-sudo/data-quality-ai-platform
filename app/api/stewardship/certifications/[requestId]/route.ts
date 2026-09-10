import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const allowedTransitions: Record<string, ReadonlySet<string>> = {
  PENDING: new Set(['IN_REVIEW', 'CANCELLED']),
  IN_REVIEW: new Set(['APPROVED', 'REJECTED', 'CANCELLED']),
  APPROVED: new Set(),
  REJECTED: new Set(),
  CANCELLED: new Set(),
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await requireUser()
    const { requestId } = await params
    const admin = createAdminClient()

    const { data: certificationRequest, error: requestError } = await admin
      .schema('governance')
      .from('certification_requests')
      .select('*')
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
    if (!Object.prototype.hasOwnProperty.call(allowedTransitions, status)) {
      return NextResponse.json({ error: 'Invalid certification status.' }, { status: 400 })
    }

    const currentStatus = String(certificationRequest.status ?? '').toUpperCase()
    const transitions = allowedTransitions[currentStatus]
    if (!transitions) {
      return NextResponse.json({ error: `Unknown current certification status: ${currentStatus}.` }, { status: 409 })
    }
    if (!transitions.has(status)) {
      return NextResponse.json(
        { error: `Certification cannot transition from ${currentStatus} to ${status}.` },
        { status: 409 },
      )
    }

    const decided = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)
    const decidedAt = decided ? new Date().toISOString() : null
    const { data, error } = await admin
      .schema('governance')
      .from('certification_requests')
      .update({
        status,
        decision_notes: typeof body.decisionNotes === 'string' ? body.decisionNotes : null,
        assigned_to: body.assignedTo ?? certificationRequest.assigned_to,
        decided_at: decidedAt,
      })
      .eq('id', requestId)
      .eq('status', currentStatus)
      .select('*')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data) {
      return NextResponse.json(
        { error: 'Certification request changed concurrently. Reload it and retry.' },
        { status: 409 },
      )
    }

    if (status === 'APPROVED' || status === 'REJECTED') {
      const { error: catalogError } = await admin
        .schema('governance')
        .from('dataset_catalog')
        .upsert(
          {
            dataset_id: certificationRequest.dataset_id,
            project_id: certificationRequest.project_id,
            certification_status: status === 'APPROVED' ? 'CERTIFIED' : 'REJECTED',
            certified_at: status === 'APPROVED' ? decidedAt : null,
            certified_by: status === 'APPROVED' ? user.id : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'dataset_id' },
        )

      if (catalogError) {
        return NextResponse.json(
          { error: `Certification decision was stored but catalog synchronization failed: ${catalogError.message}` },
          { status: 500 },
        )
      }
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
