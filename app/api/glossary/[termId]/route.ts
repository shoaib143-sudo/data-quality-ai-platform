import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedSynonyms(value: unknown) {
  if (!Array.isArray(value)) return null
  return [...new Set(value.map(item => text(item)).filter(Boolean))].slice(0, 50)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const user = await requireUser()
  const { termId } = await params
  const admin = createAdminClient()
  const { data: term, error: loadError } = await admin
    .schema('governance')
    .from('glossary_terms')
    .select('*')
    .eq('id', termId)
    .maybeSingle()
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!term) return NextResponse.json({ error: 'Term not found.' }, { status: 404 })

  try {
    await authorizeProject(user.id, term.project_id, 'glossary.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const body = await request.json()
  if ('status' in body || 'authorityType' in body || 'approvedBy' in body) {
    return NextResponse.json({ error: 'Glossary lifecycle and authority must be changed through a governed action.' }, { status: 400 })
  }

  const action = text(body.action).toUpperCase()
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now, last_changed_by: user.id }

  if (action) {
    if (action === 'ADOPT_REFERENCE') {
      if (term.status !== 'REFERENCE' || term.authority_type !== 'REFERENCE_BOOTSTRAP') {
        return NextResponse.json({ error: 'Only a reference concept can be adopted.' }, { status: 409 })
      }
      updates.status = 'DRAFT'
      updates.authority_type = 'HUMAN_GOVERNED'
      updates.owner_user_id = user.id
      updates.approved_by = null
      updates.approved_at = null
      updates.provenance = { ...(term.provenance ?? {}), adopted_from_reference: true, authoritative: false, reference_only: false }
    } else if (action === 'SUBMIT_REVIEW') {
      if (term.status !== 'DRAFT') return NextResponse.json({ error: 'Only a draft term can be submitted for review.' }, { status: 409 })
      updates.status = 'IN_REVIEW'
    } else if (action === 'APPROVE') {
      if (term.status !== 'IN_REVIEW' || term.authority_type === 'REFERENCE_BOOTSTRAP') {
        return NextResponse.json({ error: 'Only a governed term in review can be approved.' }, { status: 409 })
      }
      updates.status = 'APPROVED'
      updates.approved_by = user.id
      updates.approved_at = now
      updates.provenance = { ...(term.provenance ?? {}), authoritative: true }
    } else if (action === 'DEPRECATE') {
      if (term.status !== 'APPROVED') return NextResponse.json({ error: 'Only an approved term can be deprecated.' }, { status: 409 })
      updates.status = 'DEPRECATED'
    } else if (action === 'REOPEN') {
      if (term.status !== 'DEPRECATED') return NextResponse.json({ error: 'Only a deprecated term can be reopened.' }, { status: 409 })
      updates.status = 'DRAFT'
      updates.approved_by = null
      updates.approved_at = null
      updates.provenance = { ...(term.provenance ?? {}), authoritative: false }
    } else {
      return NextResponse.json({ error: `Unsupported glossary action ${action}.` }, { status: 400 })
    }
  }

  const semanticEdit = ['term', 'definition', 'domain', 'synonyms', 'ownerUserId'].some(key => key in body)
  if (semanticEdit) {
    if (term.status === 'REFERENCE') {
      return NextResponse.json({ error: 'Adopt the reference concept before changing its governed meaning.' }, { status: 409 })
    }
    if (term.status === 'DEPRECATED' && action !== 'REOPEN') {
      return NextResponse.json({ error: 'Reopen the deprecated term before editing it.' }, { status: 409 })
    }
    if ('term' in body) {
      const value = text(body.term)
      if (!value || value.length > 250) return NextResponse.json({ error: 'A valid term is required.' }, { status: 400 })
      updates.term = value
    }
    if ('definition' in body) {
      const value = text(body.definition)
      if (!value || value.length > 8000) return NextResponse.json({ error: 'A valid definition is required.' }, { status: 400 })
      updates.definition = value
    }
    if ('domain' in body) updates.domain = text(body.domain) || null
    if ('synonyms' in body) {
      const values = normalizedSynonyms(body.synonyms)
      if (!values) return NextResponse.json({ error: 'synonyms must be an array.' }, { status: 400 })
      updates.synonyms = values
    }
    if ('ownerUserId' in body) updates.owner_user_id = text(body.ownerUserId) || user.id

    // Editing published meaning opens a new draft; the prior approved version remains published.
    if (term.status === 'APPROVED' || term.status === 'IN_REVIEW') {
      updates.status = 'DRAFT'
      updates.approved_by = null
      updates.approved_at = null
      updates.provenance = { ...(term.provenance ?? {}), authoritative: false }
    }
  }

  if (!action && !semanticEdit) return NextResponse.json({ error: 'No glossary change was requested.' }, { status: 400 })

  const { data, error } = await admin
    .schema('governance')
    .from('glossary_terms')
    .update(updates)
    .eq('id', termId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Semantic version capture and audit insertion are DB triggers in the same transaction.
  return NextResponse.json({ term: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const user = await requireUser()
  const { termId } = await params
  const admin = createAdminClient()
  const { data: term, error } = await admin.schema('governance').from('glossary_terms').select('project_id').eq('id', termId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!term) return NextResponse.json({ error: 'Term not found.' }, { status: 404 })
  try {
    await authorizeProject(user.id, term.project_id, 'glossary.manage')
  } catch (authError) {
    const auth = authorizationErrorResponse(authError)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw authError
  }
  return NextResponse.json({ error: 'Governed glossary terms are not hard-deleted. Deprecate the term to preserve semantic history and evidence.' }, { status: 409 })
}
