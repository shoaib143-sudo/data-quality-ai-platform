import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireUser()
  const { assignmentId } = await params
  const admin = createAdminClient()
  const { data: assignment, error: loadError } = await admin
    .schema('governance')
    .from('stewardship_assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle()
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!assignment) return NextResponse.json({ error: 'Stewardship assignment not found.' }, { status: 404 })

  try {
    await authorizeProject(user.id, assignment.project_id, 'stewardship.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const body = await request.json()
  const action = text(body.action).toUpperCase()
  const reason = text(body.reason)
  const now = new Date().toISOString()
  let updates: Record<string, unknown>

  if (action === 'REVOKE') {
    if (assignment.status === 'REVOKED') return NextResponse.json({ assignment })
    updates = {
      status: 'REVOKED',
      revoked_by: user.id,
      revoked_at: now,
      decision_reason: reason || 'Governed stewardship assignment revoked.',
      last_changed_by: user.id,
      evidence: { ...(assignment.evidence ?? {}), last_action: 'REVOKE' },
      updated_at: now,
    }
  } else if (action === 'UPDATE_ACCOUNTABILITY') {
    if (assignment.status === 'REVOKED') {
      return NextResponse.json({ error: 'A revoked assignment is historical and cannot be edited.' }, { status: 409 })
    }
    const accountability = text(body.accountability)
    if (!accountability) return NextResponse.json({ error: 'accountability is required.' }, { status: 400 })
    updates = {
      accountability,
      decision_reason: reason || null,
      last_changed_by: user.id,
      evidence: { ...(assignment.evidence ?? {}), last_action: 'UPDATE_ACCOUNTABILITY' },
      updated_at: now,
    }
  } else {
    return NextResponse.json({ error: 'A supported stewardship action is required.' }, { status: 400 })
  }

  const { data, error } = await admin
    .schema('governance')
    .from('stewardship_assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Assignment history and the hash-chained audit event are committed transactionally by DB triggers.
  return NextResponse.json({ assignment: data })
}

export async function DELETE(_request: Request) {
  await requireUser()
  return NextResponse.json({ error: 'Stewardship assignments are not hard-deleted. Revoke the assignment to preserve governance evidence.' }, { status: 409 })
}
