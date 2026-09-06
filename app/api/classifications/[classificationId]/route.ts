import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function PATCH(request: Request, context: { params: Promise<{ classificationId: string }> }) {
  const user = await requireUser()
  const { classificationId } = await context.params
  const body = await request.json()
  const projectId = text(body.projectId)
  const decision = text(body.decision).toUpperCase()
  const comment = text(body.comment)
  if (!projectId || !['APPROVED', 'REJECTED'].includes(decision)) {
    return NextResponse.json({ error: 'projectId and APPROVED/REJECTED decision are required.' }, { status: 400 })
  }

  try {
    await authorizeProject(user.id, projectId, 'classification.review')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('review_dataset_classification', {
    p_project_id: projectId,
    p_classification_id: classificationId,
    p_reviewer: user.id,
    p_decision: decision,
    p_comment: comment || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ classification: data })
}
