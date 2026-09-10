import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeOrganizationAdmin, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'
const ROLES = new Set<MemberRole>(['OWNER', 'ADMIN', 'MEMBER'])

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function role(value: unknown): MemberRole | null {
  const normalized = text(value).toUpperCase() as MemberRole
  return ROLES.has(normalized) ? normalized : null
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  let page = 1
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to search users: ${error.message}`)
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 1000) return null
    page += 1
  }
  return null
}

async function ownerCount(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const { count, error } = await admin.schema('app').from('organization_members').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('role', 'OWNER')
  if (error) throw new Error(`Unable to verify organization owners: ${error.message}`)
  return count ?? 0
}

function errorResponse(error: unknown, fallback: string) {
  const authorization = authorizationErrorResponse(error)
  if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const organizationId = text(body.organizationId)
    const email = text(body.email).toLowerCase()
    const requestedRole = role(body.role) ?? 'MEMBER'
    if (!organizationId || !email || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'organizationId and a valid email are required.' }, { status: 400 })

    const authorization = await authorizeOrganizationAdmin(user.id, organizationId)
    if (requestedRole === 'OWNER' && authorization.role !== 'OWNER') return NextResponse.json({ error: 'Only an organization OWNER can grant the OWNER role.' }, { status: 403 })

    const admin = createAdminClient()
    let authUser = await findAuthUserByEmail(admin, email)
    let invitationSent = false
    if (!authUser) {
      const origin = new URL(request.url).origin
      const redirectTo = `${origin}/auth/callback?next=/reset-password`
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { invited_to_organization_id: organizationId, invited_by: user.id },
      })
      if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Unable to invite user.' }, { status: 400 })
      authUser = data.user
      invitationSent = true
    }

    const { data: existing } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', authUser.id).maybeSingle()
    if (existing) return NextResponse.json({ error: 'This user is already a member of the organization.' }, { status: 409 })

    const { data: membership, error: insertError } = await admin.schema('app').from('organization_members').insert({ organization_id: organizationId, user_id: authUser.id, role: requestedRole }).select('organization_id,user_id,role,created_at').single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    const activationRequired = !authUser.last_sign_in_at
    await writeGovernanceAudit({ actorUserId: user.id, eventType: 'ORGANIZATION_MEMBER_ADDED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { member_user_id: authUser.id, email, role: requestedRole, invitation_sent: invitationSent, activation_required: activationRequired } })
    return NextResponse.json({ membership, user: { id: authUser.id, email: authUser.email }, invitationSent, activationRequired }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'Unable to add organization member.')
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const organizationId = text(body.organizationId)
    const memberUserId = text(body.userId)
    const requestedRole = role(body.role)
    if (!organizationId || !memberUserId || !requestedRole) return NextResponse.json({ error: 'organizationId, userId and a valid role are required.' }, { status: 400 })

    const authorization = await authorizeOrganizationAdmin(user.id, organizationId)
    const admin = createAdminClient()
    const { data: target, error: targetError } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', memberUserId).maybeSingle()
    if (targetError || !target) return NextResponse.json({ error: 'Organization member was not found.' }, { status: 404 })

    const currentRole = String(target.role) as MemberRole
    if ((currentRole === 'OWNER' || requestedRole === 'OWNER') && authorization.role !== 'OWNER') return NextResponse.json({ error: 'Only an organization OWNER can modify OWNER membership.' }, { status: 403 })
    if (currentRole === 'OWNER' && requestedRole !== 'OWNER' && await ownerCount(admin, organizationId) <= 1) return NextResponse.json({ error: 'The last organization OWNER cannot be demoted.' }, { status: 409 })

    const { data: membership, error } = await admin.schema('app').from('organization_members').update({ role: requestedRole }).eq('organization_id', organizationId).eq('user_id', memberUserId).select('organization_id,user_id,role,created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await writeGovernanceAudit({ actorUserId: user.id, eventType: 'ORGANIZATION_MEMBER_ROLE_CHANGED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { member_user_id: memberUserId, previous_role: currentRole, role: requestedRole } })
    return NextResponse.json({ membership })
  } catch (error) {
    return errorResponse(error, 'Unable to update organization member.')
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const organizationId = text(body.organizationId)
    const memberUserId = text(body.userId)
    if (!organizationId || !memberUserId) return NextResponse.json({ error: 'organizationId and userId are required.' }, { status: 400 })

    const authorization = await authorizeOrganizationAdmin(user.id, organizationId)
    const admin = createAdminClient()
    const { data: target, error: targetError } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', memberUserId).maybeSingle()
    if (targetError || !target) return NextResponse.json({ error: 'Organization member was not found.' }, { status: 404 })

    const targetRole = String(target.role) as MemberRole
    if (targetRole === 'OWNER') {
      if (authorization.role !== 'OWNER') return NextResponse.json({ error: 'Only an organization OWNER can remove another OWNER.' }, { status: 403 })
      if (await ownerCount(admin, organizationId) <= 1) return NextResponse.json({ error: 'The last organization OWNER cannot be removed.' }, { status: 409 })
    }

    const { error } = await admin.schema('app').from('organization_members').delete().eq('organization_id', organizationId).eq('user_id', memberUserId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await writeGovernanceAudit({ actorUserId: user.id, eventType: 'ORGANIZATION_MEMBER_REMOVED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { member_user_id: memberUserId, previous_role: targetRole } })
    return NextResponse.json({ removed: true })
  } catch (error) {
    return errorResponse(error, 'Unable to remove organization member.')
  }
}
