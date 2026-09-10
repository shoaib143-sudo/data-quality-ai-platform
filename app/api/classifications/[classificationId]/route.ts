import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function PATCH(request: Request, context: { params: Promise<{ classificationId: string }> }) {
  try {
    const user = await requireApiUser()
    const { classificationId } = await context.params
    const body = await request.json() as Record<string, unknown>
    const projectId = text(body.projectId)
    const decision = text(body.decision).toUpperCase()
    const comment = text(body.comment)
    if (!projectId || !['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'projectId and APPROVED/REJECTED decision are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'classification.review')

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('review_dataset_classification', {
      p_project_id: projectId,
      p_classification_id: classificationId,
      p_reviewer: user.id,
      p_decision: decision,
      p_comment: comment || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : error.code === '23514' ? 409 : 400 })
    return NextResponse.json({ classification: data })
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }
}
