import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const ruleId = text(body?.ruleId ?? body?.rule_id)
    const decision = text(body?.decision).toUpperCase()
    const comment = text(body?.comment).slice(0, 2000)

    if (!projectId || !ruleId) {
      return NextResponse.json({ error: 'projectId and ruleId are required.' }, { status: 400 })
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'quality.manage')
    const admin = createAdminClient()
    const { data, error } = await admin.schema('profiling').rpc('review_quality_rule', {
      p_project_id: projectId,
      p_rule_id: ruleId,
      p_reviewer: user.id,
      p_decision: decision,
      p_comment: comment || null,
    })
    if (error) throw new Error(`Unable to persist quality rule review: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Quality rule review did not confirm atomic audit and database capability verification.')
    }

    return NextResponse.json({ accepted: true, decision, capability: 'quality.manage', review: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Quality rule review failed.' }, { status: 500 })
  }
}
