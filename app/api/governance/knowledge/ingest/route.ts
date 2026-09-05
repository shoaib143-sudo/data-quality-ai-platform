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
    if (!body) return NextResponse.json({ error: 'JSON request body is required.' }, { status: 400 })

    const projectId = text(body.projectId ?? body.project_id)
    const rawDocument = body.document && typeof body.document === 'object' && !Array.isArray(body.document)
      ? body.document as Record<string, unknown>
      : body
    const requirements = Array.isArray(body.requirements) ? body.requirements : []

    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    const sourceKind = text(rawDocument.sourceKind ?? rawDocument.source_kind).toUpperCase()
    if (!['INTERNAL', 'EXTERNAL_REFERENCE'].includes(sourceKind)) {
      return NextResponse.json({ error: 'sourceKind must be INTERNAL or EXTERNAL_REFERENCE for enterprise governance intake.' }, { status: 400 })
    }
    if (!text(rawDocument.sourceUrl ?? rawDocument.source_url)) {
      return NextResponse.json({ error: 'sourceUrl provenance is required for enterprise governance intake.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.update')

    const document = {
      ...rawDocument,
      sourceKind,
    }
    delete (document as Record<string, unknown>).projectId
    delete (document as Record<string, unknown>).project_id
    delete (document as Record<string, unknown>).requirements

    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('ingest_governance_knowledge_document', {
      p_project_id: projectId,
      p_actor: user.id,
      p_document: document,
      p_requirements: requirements,
    })
    if (error) throw new Error(`Unable to ingest governance knowledge document: ${error.message}`)
    if (!data || typeof data !== 'object' || data.audit_atomic !== true || data.review_status !== 'PENDING' || data.status !== 'DRAFT') {
      throw new Error('Governance knowledge intake did not confirm atomic pending-review persistence.')
    }

    return NextResponse.json({
      accepted: true,
      projectId,
      capability: 'catalog.update',
      document: data,
    }, { status: 202 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance knowledge ingestion failed.' }, { status: 500 })
  }
}
