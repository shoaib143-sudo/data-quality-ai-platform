import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createGovernanceRetrievalLabelRecorder } from '@/lib/ai/governance-retrieval-label-recorder'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function evidenceRefs(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => text(entry)).filter(Boolean)
}

function judgments(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { objectKey: '', relevance: Number.NaN }
    const record = entry as Record<string, unknown>
    return {
      objectKey: text(record.objectKey ?? record.object_key),
      relevance: Number(record.relevance),
    }
  })
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'admin.manage')

    const caseKey = text(body?.caseKey ?? body?.case_key)
    const query = text(body?.query)
    const refs = evidenceRefs(body?.evidenceRefs ?? body?.evidence_refs)
    const relevanceJudgments = judgments(body?.judgments)
    if (!caseKey || !query || !refs.length || !relevanceJudgments.length) {
      return NextResponse.json({ error: 'caseKey, query, evidenceRefs and judgments are required.' }, { status: 400 })
    }

    const receipt = await createGovernanceRetrievalLabelRecorder().recordHumanReviewedCase({
      projectId,
      caseKey,
      query,
      evidenceRefs: refs,
      judgments: relevanceJudgments,
      reviewerUserId: user.id,
      reviewerCapability: 'admin.manage',
    })

    return NextResponse.json({ accepted: true, receipt }, { status: 201 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to record retrieval relevance evidence.'
    const status = /required|non-negative integer|positive relevance|duplicate relevance|admin\.manage/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
