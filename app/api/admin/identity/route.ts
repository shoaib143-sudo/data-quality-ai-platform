import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeOrganizationAdmin, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { scimTokenHash } from '@/lib/identity/scim'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function role(value: unknown) { const result = text(value).toUpperCase(); return ['MEMBER','ADMIN'].includes(result) ? result : 'MEMBER' }
function validDomain(value: string) { return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value) }

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const organizationId = text(new URL(request.url).searchParams.get('organizationId'))
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 })
    await authorizeOrganizationAdmin(user.id, organizationId)
    const admin = createAdminClient()
    const [domains, directories] = await Promise.all([
      admin.schema('governance').from('sso_domains').select('id,organization_id,domain,provider_id,auto_join,default_role,enabled,created_at,updated_at').eq('organization_id', organizationId).order('domain'),
      admin.schema('governance').from('scim_directories').select('id,organization_id,name,default_role,enabled,created_at,last_used_at').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    ])
    const firstError = [domains.error, directories.error].find(Boolean)
    if (firstError) throw new Error(firstError.message)
    return NextResponse.json({ ssoDomains: domains.data ?? [], scimDirectories: directories.data ?? [] })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load enterprise identity configuration.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json() as Record<string, unknown>
    const organizationId = text(body.organizationId)
    const action = text(body.action).toUpperCase()
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 })
    await authorizeOrganizationAdmin(user.id, organizationId)
    const admin = createAdminClient()

    if (action === 'UPSERT_SSO_DOMAIN') {
      const domain = text(body.domain).toLowerCase()
      if (!validDomain(domain)) return NextResponse.json({ error: 'A valid enterprise email domain is required.' }, { status: 400 })
      const providerId = text(body.providerId) || null
      if (providerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providerId)) return NextResponse.json({ error: 'providerId must be a valid UUID.' }, { status: 400 })
      const payload = { organization_id: organizationId, domain, provider_id: providerId, auto_join: body.autoJoin === true, default_role: role(body.defaultRole), enabled: body.enabled !== false, created_by: user.id, updated_at: new Date().toISOString() }
      const { data, error } = await admin.schema('governance').from('sso_domains').upsert(payload, { onConflict: 'domain' }).select('id,organization_id,domain,provider_id,auto_join,default_role,enabled,created_at,updated_at').single()
      if (error) throw new Error(`Unable to save SSO domain mapping: ${error.message}`)
      await writeGovernanceAudit({ actorUserId: user.id, eventType: 'SSO_DOMAIN_CONFIGURED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { domain, provider_id: providerId, auto_join: payload.auto_join, default_role: payload.default_role, enabled: payload.enabled } })
      return NextResponse.json({ ssoDomain: data })
    }

    if (action === 'CREATE_SCIM_DIRECTORY') {
      const name = text(body.name)
      if (!name) return NextResponse.json({ error: 'SCIM directory name is required.' }, { status: 400 })
      const token = `dgp_scim_${randomBytes(32).toString('base64url')}`
      const { data, error } = await admin.schema('governance').from('scim_directories').insert({ organization_id: organizationId, name, token_hash: scimTokenHash(token), default_role: role(body.defaultRole), enabled: true, created_by: user.id }).select('id,organization_id,name,default_role,enabled,created_at,last_used_at').single()
      if (error) throw new Error(`Unable to create SCIM directory: ${error.message}`)
      await writeGovernanceAudit({ actorUserId: user.id, eventType: 'SCIM_DIRECTORY_CREATED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { directory_id: data.id, name, default_role: data.default_role } })
      return NextResponse.json({ scimDirectory: data, token, tokenShownOnce: true }, { status: 201 })
    }

    return NextResponse.json({ error: 'Unsupported identity action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update enterprise identity configuration.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json() as Record<string, unknown>
    const organizationId = text(body.organizationId)
    const directoryId = text(body.directoryId)
    if (!organizationId || !directoryId) return NextResponse.json({ error: 'organizationId and directoryId are required.' }, { status: 400 })
    await authorizeOrganizationAdmin(user.id, organizationId)
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('scim_directories').update({ enabled: body.enabled === true, default_role: role(body.defaultRole) }).eq('id', directoryId).eq('organization_id', organizationId).select('id,name,default_role,enabled,created_at,last_used_at').single()
    if (error) throw new Error(`Unable to update SCIM directory: ${error.message}`)
    await writeGovernanceAudit({ actorUserId: user.id, eventType: 'SCIM_DIRECTORY_UPDATED', entityType: 'ORGANIZATION', entityId: organizationId, metadata: { directory_id: directoryId, enabled: data.enabled, default_role: data.default_role } })
    return NextResponse.json({ scimDirectory: data })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update SCIM directory.' }, { status: 500 })
  }
}
