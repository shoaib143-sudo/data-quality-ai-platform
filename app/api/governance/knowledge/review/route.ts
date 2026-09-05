import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const objectType = text(body?.objectType ?? body?.object_type).toUpperCase()
    const objectId = text(body?.objectId ?? body?.object_id)
    const decision = text(body?.decision).toUpperCase()
    const comment = text(body?.comment).slice(0, 2000)
    const supportedTypes = ['CLASSIFICATION', 'CDE_MAPPING', 'KNOWLEDGE_DOCUMENT']

    if (!projectId || !objectId || !supportedTypes.includes(objectType)) {
      return NextResponse.json({ error: 'projectId, objectId and objectType (CLASSIFICATION, CDE_MAPPING or KNOWLEDGE_DOCUMENT) are required.' }, { status: 400 })
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED.' }, { status: 400 })
    }

    const capability = objectType === 'CLASSIFICATION'
      ? 'classification.review'
      : objectType === 'CDE_MAPPING'
        ? 'stewardship.manage'
        : 'policy.approve'
    await authorizeProject(user.id, projectId, capability)

    const admin = createAdminClient()
    const rpcName = objectType === 'CLASSIFICATION'
      ? 'review_dataset_classification'
      : objectType === 'CDE_MAPPING'
        ? 'review_cde_mapping'
        : 'review_governance_knowledge_document'
    const args = objectType === 'CLASSIFICATION'
      ? { p_project_id: projectId, p_classification_id: objectId, p_reviewer: user.id, p_decision: decision, p_comment: comment || null }
      : objectType === 'CDE_MAPPING'
        ? { p_project_id: projectId, p_mapping_id: objectId, p_reviewer: user.id, p_decision: decision, p_comment: comment || null }
        : { p_project_id: projectId, p_document_id: objectId, p_reviewer: user.id, p_decision: decision, p_comment: comment || null }

    const { data, error } = await admin.schema('governance').rpc(rpcName, args)
    if (error) throw new Error(`Unable to persist governance knowledge review: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true) {
      throw new Error('Governance knowledge review did not confirm atomic audit persistence.')
    }
    if (objectType === 'KNOWLEDGE_DOCUMENT') {
      const expectedStatus = decision === 'APPROVED' ? 'ACTIVE' : 'DRAFT'
      if (data.review_status !== decision || data.status !== expectedStatus) {
        throw new Error('Governance knowledge document review returned an invalid governed state transition.')
      }
    }

    return NextResponse.json({ accepted: true, objectType, decision, capability, review: data })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance knowledge review failed.' }, { status: 500 })
  }
}
