import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject } from '@/lib/auth/authorize'
import { authorizeDataGovernanceSuperAdmin } from '@/lib/auth/data-governance-super-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NEGATIVE_CASE_ADMIN_DECISIONS,
  reviewGovernedNegativeLearningCase,
  type NegativeCaseAdminDecision,
} from '@/lib/agents/governed-negative-case-learning-service'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request, context: { params: Promise<{ candidateId: string }> }) {
  try {
    const user = await requireUser()
    const { candidateId } = await context.params
    const body = await request.json()
    const decision = text(body.decision).toUpperCase() as NegativeCaseAdminDecision
    const reason = text(body.reason)

    if (!candidateId || !NEGATIVE_CASE_ADMIN_DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'A valid negative-case decision is required.' }, { status: 400 })
    }
    if (!reason) return NextResponse.json({ error: 'A review reason is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: negativeCase, error } = await admin.schema('agent').from('negative_learning_cases')
      .select('candidate_id,project_id,review_status')
      .eq('candidate_id', candidateId)
      .maybeSingle()
    if (error) throw new Error(`Unable to resolve negative learning case: ${error.message}`)
    if (!negativeCase) return NextResponse.json({ error: 'Negative learning case was not found.' }, { status: 404 })

    const projectId = String(negativeCase.project_id)
    await authorizeProject(user.id, projectId, 'agent.admin')
    await authorizeDataGovernanceSuperAdmin(user.id, projectId)

    await reviewGovernedNegativeLearningCase({
      projectId,
      candidateId,
      actorUserId: user.id,
      decision,
      reason,
    })

    return NextResponse.json({ candidateId, decision, reviewed: true })
  } catch (error) {
    const status = error instanceof Error && 'status' in error
      ? Number((error as { status?: number }).status ?? 500)
      : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to review negative learning case.' },
      { status },
    )
  }
}
