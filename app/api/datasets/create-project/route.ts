import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeOrganizationAdmin, authorizationErrorResponse } from '@/lib/auth/authorize'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project'
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const organizationId = text(body.organizationId)
    const name = text(body.name)
    const description = text(body.description)
    if (!organizationId || !name) return NextResponse.json({ error: 'organizationId and project name are required.' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: 'Project name must be 120 characters or fewer.' }, { status: 400 })

    await authorizeOrganizationAdmin(user.id, organizationId)

    const admin = createAdminClient()
    const baseSlug = slugify(name)
    let slug = baseSlug
    for (let attempt = 2; attempt <= 100; attempt += 1) {
      const { data: existing, error: lookupError } = await admin.schema('app').from('projects').select('id').eq('organization_id', organizationId).eq('slug', slug).maybeSingle()
      if (lookupError) throw new Error(`Unable to validate project name: ${lookupError.message}`)
      if (!existing) break
      slug = `${baseSlug}-${attempt}`.slice(0, 80)
    }

    const { data: project, error } = await admin.schema('app').from('projects').insert({ organization_id: organizationId, name, slug, description: description || null, metadata: { created_via: 'datasets' } }).select('id, organization_id, name, slug, description, created_at').single()
    if (error || !project) return NextResponse.json({ error: `Unable to create project: ${error?.message ?? 'unknown error'}` }, { status: 500 })
    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project creation failed.' }, { status: 500 })
  }
}
