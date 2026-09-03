import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { requireScimDirectory, ScimAuthError, scimError, scimUser } from '@/lib/identity/scim'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function context(request: Request, userId: string) {
  const directory = await requireScimDirectory(request)
  const admin = createAdminClient()
  const { data: membership, error: membershipError } = await admin.schema('app').from('organization_members')
    .select('role').eq('organization_id', directory.organization_id).eq('user_id', userId).maybeSingle()
  if (membershipError) throw new Error(`Unable to resolve SCIM membership: ${membershipError.message}`)
  const { data: authResult, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !authResult.user) return { directory, admin, membership, user: null }
  return { directory, admin, membership, user: authResult.user }
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const result = await context(request, userId)
    if (!result.user || !result.membership) return scimError('User was not found in this SCIM directory.', 404)
    return Response.json(scimUser(result.user, true, String(result.membership.role)), { headers: { 'Content-Type': 'application/scim+json' } })
  } catch (error) {
    if (error instanceof ScimAuthError) return scimError(error.message, error.status)
    return scimError(error instanceof Error ? error.message : 'Unable to load SCIM user.', 500)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const result = await context(request, userId)
    if (!result.user) return scimError('User was not found.', 404)
    const body = await request.json() as Record<string, unknown>
    const operations = Array.isArray(body.Operations) ? body.Operations as Array<Record<string, unknown>> : []
    let active = Boolean(result.membership)
    let displayName = typeof result.user.user_metadata?.display_name === 'string' ? result.user.user_metadata.display_name : result.user.email ?? ''

    for (const operation of operations) {
      const op = text(operation.op).toLowerCase()
      const path = text(operation.path).toLowerCase()
      const value = operation.value
      if (!['replace','add','remove'].includes(op)) continue
      if (path === 'active' || (!path && value && typeof value === 'object' && 'active' in (value as Record<string, unknown>))) {
        active = path === 'active' ? value !== false : (value as Record<string, unknown>).active !== false
      }
      if (path === 'displayname') displayName = text(value) || displayName
      if (!path && value && typeof value === 'object') displayName = text((value as Record<string, unknown>).displayName) || displayName
    }

    if (active && !result.membership) {
      const { error } = await result.admin.schema('app').from('organization_members').insert({ organization_id: result.directory.organization_id, user_id: userId, role: result.directory.default_role })
      if (error) throw new Error(`Unable to activate SCIM membership: ${error.message}`)
    } else if (!active && result.membership) {
      const { error } = await result.admin.schema('app').from('organization_members').delete().eq('organization_id', result.directory.organization_id).eq('user_id', userId)
      if (error) throw new Error(`Unable to deactivate SCIM membership: ${error.message}`)
    }

    if (displayName) await result.admin.auth.admin.updateUserById(userId, { user_metadata: { ...result.user.user_metadata, display_name: displayName, provisioned_by: 'SCIM' } })
    await writeGovernanceAudit({ actorType: 'SYSTEM', eventType: active ? 'SCIM_USER_ACTIVATED' : 'SCIM_USER_DEACTIVATED', entityType: 'ORGANIZATION', entityId: result.directory.organization_id, metadata: { directory_id: result.directory.id, user_id: userId } })
    return Response.json(scimUser({ ...result.user, user_metadata: { ...result.user.user_metadata, display_name: displayName } }, active, result.membership?.role ? String(result.membership.role) : result.directory.default_role), { headers: { 'Content-Type': 'application/scim+json' } })
  } catch (error) {
    if (error instanceof ScimAuthError) return scimError(error.message, error.status)
    return scimError(error instanceof Error ? error.message : 'Unable to update SCIM user.', 500)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const result = await context(request, userId)
    if (!result.user || !result.membership) return new Response(null, { status: 204 })
    const { error } = await result.admin.schema('app').from('organization_members').delete().eq('organization_id', result.directory.organization_id).eq('user_id', userId)
    if (error) throw new Error(`Unable to remove SCIM membership: ${error.message}`)
    await writeGovernanceAudit({ actorType: 'SYSTEM', eventType: 'SCIM_USER_DEPROVISIONED', entityType: 'ORGANIZATION', entityId: result.directory.organization_id, metadata: { directory_id: result.directory.id, user_id: userId } })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof ScimAuthError) return scimError(error.message, error.status)
    return scimError(error instanceof Error ? error.message : 'Unable to remove SCIM user.', 500)
  }
}
