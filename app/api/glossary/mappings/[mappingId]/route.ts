import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(request: Request, { params }: { params: Promise<{ mappingId: string }> }) {
  const user = await requireUser()
  const { mappingId } = await params
  const admin = createAdminClient()
  const { data: mapping, error: mappingError } = await admin
    .schema('governance')
    .from('glossary_mappings')
    .select('*')
    .eq('id', mappingId)
    .maybeSingle()
  if (mappingError) return NextResponse.json({ error: mappingError.message }, { status: 500 })
  if (!mapping) return NextResponse.json({ error: 'Mapping not found.' }, { status: 404 })

  const { data: term, error: termError } = await admin
    .schema('governance')
    .from('glossary_terms')
    .select('id,project_id,status,authority_type')
    .eq('id', mapping.term_id)
    .maybeSingle()
  if (termError) return NextResponse.json({ error: termError.message }, { status: 500 })
  if (!term) return NextResponse.json({ error: 'Term not found.' }, { status: 404 })

  try {
    await authorizeProject(user.id, term.project_id, 'glossary.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const body = await request.json()
  const action = text(body.action).toUpperCase()
  const now = new Date().toISOString()
  const evidence = { ...(mapping.evidence ?? {}), last_review_action: action }
  let updates: Record<string, unknown>

  if (action === 'APPROVE') {
    if (mapping.mapping_status === 'APPROVED') return NextResponse.json({ mapping })
    if (term.status !== 'APPROVED' || term.authority_type === 'REFERENCE_BOOTSTRAP') {
      return NextResponse.json({ error: 'Approve the governed term before approving its semantic mappings.' }, { status: 409 })
    }
    if (mapping.target_type === 'CATALOG_ASSET' && mapping.validation_state !== 'VALID') {
      return NextResponse.json({ error: 'A stale or unverified catalog mapping cannot be approved.' }, { status: 409 })
    }
    updates = {
      mapping_status: 'APPROVED', approved: true, approved_by: user.id,
      reviewed_by: user.id, reviewed_at: now, last_changed_by: user.id, evidence,
    }
  } else if (action === 'REJECT') {
    if (mapping.mapping_status === 'REJECTED') return NextResponse.json({ mapping })
    updates = {
      mapping_status: 'REJECTED', approved: false, approved_by: null,
      reviewed_by: user.id, reviewed_at: now, last_changed_by: user.id, evidence,
    }
  } else if (action === 'RESET_PROPOSAL') {
    if (mapping.mapping_status === 'PROPOSED') return NextResponse.json({ mapping })
    updates = {
      mapping_status: 'PROPOSED', approved: false, approved_by: null,
      reviewed_by: null, reviewed_at: null, last_changed_by: user.id, evidence,
    }
  } else {
    return NextResponse.json({ error: 'A supported mapping review action is required.' }, { status: 400 })
  }

  const { data, error } = await admin
    .schema('governance')
    .from('glossary_mappings')
    .update(updates)
    .eq('id', mappingId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Review decision and audit evidence are inserted by DB triggers in this same transaction.
  return NextResponse.json({ mapping: data })
}
