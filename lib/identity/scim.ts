import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export type ScimDirectory = {
  id: string
  organization_id: string
  name: string
  default_role: 'MEMBER' | 'ADMIN'
  enabled: boolean
}

export function scimTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export async function requireScimDirectory(request: Request): Promise<ScimDirectory> {
  const token = bearerToken(request)
  if (!token) throw new ScimAuthError('SCIM bearer token is required.', 401)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('scim_directories')
    .select('id,organization_id,name,default_role,enabled')
    .eq('token_hash', scimTokenHash(token))
    .eq('enabled', true)
    .maybeSingle()
  if (error) throw new Error(`Unable to authenticate SCIM directory: ${error.message}`)
  if (!data) throw new ScimAuthError('SCIM bearer token is invalid or disabled.', 401)
  await admin.schema('governance').from('scim_directories').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return data as ScimDirectory
}

export class ScimAuthError extends Error {
  status: number
  constructor(message: string, status = 401) { super(message); this.status = status }
}

export async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to search the identity directory: ${error.message}`)
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 1000) return null
  }
  return null
}

export function scimUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown>; created_at?: string }, active: boolean, role?: string | null) {
  const displayName = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : user.email ?? user.id
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User', 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'],
    id: user.id,
    userName: user.email ?? '',
    displayName,
    active,
    emails: user.email ? [{ value: user.email, primary: true, type: 'work' }] : [],
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { organization: role ?? null },
    meta: { resourceType: 'User', created: user.created_at ?? null },
  }
}

export function scimError(message: string, status: number) {
  return Response.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: message, status: String(status) }, { status, headers: { 'Content-Type': 'application/scim+json' } })
}
