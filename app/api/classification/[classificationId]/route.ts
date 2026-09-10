import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const allowedStatuses = new Set(['SUGGESTED', 'APPROVED', 'REJECTED'])

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

    const body = await request.json()
    const status = String(body.status ?? item.status).toUpperCase()
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

    const { data, error } = await admin
      .schema('governance')
      .from('dataset_classifications')
      .update({
        status,
        approved_by: status === 'APPROVED' ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classificationId)
      .eq('project_id', item.project_id)
      .select('*')
      .single()

    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ classification: data })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    throw error
  }
}
