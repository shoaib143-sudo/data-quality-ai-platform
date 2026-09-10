import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const allowedDecisions = new Set(['APPROVED', 'REJECTED'])
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ classificationId: string }> },
) {
  try {
    const user = await requireApiUser()
    const { classificationId } = await params
    const admin = createAdminClient()
    const { data: item, error: itemError } = await admin
      .schema('governance')
      .from('dataset_classifications')
      .select('id,project_id,status')
      .eq('id', classificationId)
      .maybeSingle()

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })
    if (!item) return NextResponse.json({ error: 'Classification not found.' }, { status: 404 })

    await authorizeProject(user.id, item.project_id, 'classification.review')

    const body = await request.json() as Record<string, unknown>
    const decision = text(body.decision ?? body.status).toUpperCase()
    const comment = text(body.comment ?? body.reviewComment ?? body.decisionNotes)
    if (!allowedDecisions.has(decision)) {
      return NextResponse.json({ error: 'APPROVED or REJECTED decision is required.' }, { status: 400 })
    }

    const { data, error } = await admin.schema('governance').rpc('review_dataset_classification', {
      p_project_id: item.project_id,
      p_classification_id: classificationId,
      p_reviewer: user.id,
      p_decision: decision,
      p_comment: comment || null,
    })

    return error
      ? NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : error.code === '23514' ? 409 : 400 })
      : NextResponse.json({ classification: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    throw error
  }
}
