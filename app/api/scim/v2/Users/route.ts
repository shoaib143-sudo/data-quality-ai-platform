import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { findAuthUserByEmail, requireScimDirectory, ScimAuthError, scimError, scimUser } from '@/lib/identity/scim'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function normalizedEmail(value: unknown) { const email = text(value).toLowerCase(); return /^\S+@\S+\.\S+$/.test(email) ? email : '' }

export async function GET(request: Request) {
  try {
    const directory = await requireScimDirectory(request)
    const admin = createAdminClient()
    const url = new URL(request.url)
    const startIndex = Math.max(1, Number(url.searchParams.get('startIndex') ?? 1) || 1)
    const count = Math.min(200, Math.max(1, Number(url.searchParams.get('count') ?? 100) || 100))
    const filter = url.searchParams.get('filter') ?? ''
    const emailFilter = filter.match(/^userName\s+eq\s+"([^"]+)"$/i)?.[1]?.toLowerCase() ?? null

    const { data: memberships, error: membershipError } = await admin.schema('app').from('organization_members')
      .select('user_id,role,created_at').eq('organization_id', directory.organization_id).order('created_at')
    if (membershipError) throw new Error(`Unable to list SCIM organization members: ${membershipError.message}`)

    const resources: ReturnType<typeof scimUser>[] = []
    for (const membership of memberships ?? []) {
      const { data, error } = await admin.auth.admin.getUserById(membership.user_id)
      if (error || !data.user) continue
      if (emailFilter && data.user.email?.toLowerCase() !== emailFilter) continue
      resources.push(scimUser(data.user, true, String(membership.role)))
    }

    const sliced = resources.slice(startIndex - 1, startIndex - 1 + count)
    return Response.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: resources.length, startIndex, itemsPerPage: sliced.length, Resources: sliced }, { headers: { 'Content-Type': 'application/scim+json' } })
  } catch (error) {
    if (error instanceof ScimAuthError) return scimError(error.message, error.status)
    return scimError(error instanceof Error ? error.message : 'Unable to list SCIM users.', 500)
  }
}

export async function POST(request: Request) {
  try {
    const directory = await requireScimDirectory(request)
    const body = await request.json() as Record<string, unknown>
    const email = normalizedEmail(body.userName ?? (Array.isArray(body.emails) ? (body.emails[0] as Record<string, unknown> | undefined)?.value : null))
    if (!email) return scimError('A valid userName email is required.', 400)
    const displayName = text(body.displayName) || email
    const active = body.active !== false
    const admin = createAdminClient()

    let authUser = await findAuthUserByEmail(email)
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: displayName, provisioned_by: 'SCIM' } })
      if (error || !data.user) throw new Error(`Unable to create SCIM identity: ${error?.message ?? 'unknown error'}`)
      authUser = data.user
    }

    const { data: existing, error: existingError } = await admin.schema('app').from('organization_members')
      .select('role').eq('organization_id', directory.organization_id).eq('user_id', authUser.id).maybeSingle()
    if (existingError) throw new Error(`Unable to resolve SCIM membership: ${existingError.message}`)

    if (active && !existing) {
      const { error } = await admin.schema('app').from('organization_members').insert({ organization_id: directory.organization_id, user_id: authUser.id, role: directory.default_role })
      if (error) throw new Error(`Unable to provision SCIM membership: ${error.message}`)
    }
    if (!active && existing) {
      const { error } = await admin.schema('app').from('organization_members').delete().eq('organization_id', directory.organization_id).eq('user_id', authUser.id)
      if (error) throw new Error(`Unable to deactivate SCIM membership: ${error.message}`)
    }

    if (displayName) await admin.auth.admin.updateUserById(authUser.id, { user_metadata: { ...authUser.user_metadata, display_name: displayName, provisioned_by: 'SCIM' } })
    await writeGovernanceAudit({ actorType: 'SYSTEM', eventType: 'SCIM_USER_PROVISIONED', entityType: 'ORGANIZATION', entityId: directory.organization_id, metadata: { directory_id: directory.id, user_id: authUser.id, active, role: directory.default_role } })

    return Response.json(scimUser(authUser, active, existing?.role ? String(existing.role) : directory.default_role), { status: 201, headers: { 'Content-Type': 'application/scim+json', Location: `/api/scim/v2/Users/${authUser.id}` } })
  } catch (error) {
    if (error instanceof ScimAuthError) return scimError(error.message, error.status)
    return scimError(error instanceof Error ? error.message : 'Unable to provision SCIM user.', 500)
  }
}
