import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function synonyms(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => text(item)).filter(Boolean))].slice(0, 50)
}

export async function GET(request: Request) {
  const user = await requireUser()
  const projectId = text(new URL(request.url).searchParams.get('projectId'))
  if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
  try {
    await authorizeProject(user.id, projectId, 'glossary.read')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('governance')
    .from('glossary_terms')
    .select('*,glossary_mappings(*),glossary_term_versions(*)')
    .eq('project_id', projectId)
    .order('term')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ terms: data ?? [] })
}

export async function POST(request: Request) {
  const user = await requireUser()
  const body = await request.json()
  const projectId = text(body.projectId)
  const term = text(body.term)
  const definition = text(body.definition)
  if (!projectId || !term || !definition) {
    return NextResponse.json({ error: 'projectId, term and definition are required.' }, { status: 400 })
  }
  if (term.length > 250 || definition.length > 8000) {
    return NextResponse.json({ error: 'Term or definition exceeds the supported length.' }, { status: 400 })
  }
  try {
    await authorizeProject(user.id, projectId, 'glossary.manage')
  } catch (error) {
    const auth = authorizationErrorResponse(error)
    if (auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    throw error
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .schema('governance')
    .from('glossary_terms')
    .insert({
      project_id: projectId,
      term,
      definition,
      domain: text(body.domain) || null,
      synonyms: synonyms(body.synonyms),
      status: 'DRAFT',
      authority_type: 'HUMAN_GOVERNED',
      owner_user_id: text(body.ownerUserId) || user.id,
      approved_by: null,
      approved_at: null,
      last_changed_by: user.id,
      provenance: { origin: 'HUMAN', created_via: 'WEB_UI' },
      metadata: { source: 'HUMAN_GOVERNED' },
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // DB triggers capture immutable semantic version + audit evidence in this transaction.
  return NextResponse.json({ term: data }, { status: 201 })
}
