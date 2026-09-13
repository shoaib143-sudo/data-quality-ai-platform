import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeOrganizationAdmin, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXECUTE_TOKEN = 'ROTATE_13_PERSONA_TEST_CREDENTIALS'

const PERSONAS = [
  { slug: 'senior-leadership', roleKey: 'SENIOR_LEADERSHIP' },
  { slug: 'business-user', roleKey: 'BUSINESS_USER' },
  { slug: 'data-owner', roleKey: 'DATA_OWNER' },
  { slug: 'data-product-owner', roleKey: 'DATA_PRODUCT_OWNER' },
  { slug: 'data-steward', roleKey: 'DATA_STEWARD' },
  { slug: 'data-governance-specialist', roleKey: 'DATA_GOVERNANCE_SPECIALIST' },
  { slug: 'compliance-risk-officer', roleKey: 'COMPLIANCE_RISK_OFFICER' },
  { slug: 'privacy-security-officer', roleKey: 'PRIVACY_SECURITY_OFFICER' },
  { slug: 'data-governance-admin', roleKey: 'DATA_GOVERNANCE_ADMIN' },
  { slug: 'data-custodian', roleKey: 'DATA_CUSTODIAN' },
  { slug: 'source-system-owner', roleKey: 'SOURCE_SYSTEM_OWNER' },
  { slug: 'metadata-analyst', roleKey: 'METADATA_ANALYST' },
  { slug: 'data-quality-analyst', roleKey: 'DATA_QUALITY_ANALYST' },
] as const

function errorResponse(error: unknown, fallback: string) {
  const authorization = authorizationErrorResponse(error)
  if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}

function password() {
  return `DnX!${randomBytes(24).toString('base64url')}#9Q`
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const projectId = text(body.projectId)
    const execute = text(body.execute)
    if (!projectId || execute !== EXECUTE_TOKEN) {
      return NextResponse.json({ error: 'Explicit projectId and execution confirmation are required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin.schema('app').from('projects')
      .select('id,organization_id,name').eq('id', projectId).maybeSingle()
    if (projectError || !project) return NextResponse.json({ error: 'Target project was not found.' }, { status: 404 })

    const authorization = await authorizeOrganizationAdmin(user.id, project.organization_id)
    if (authorization.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only an organization OWNER can provision persona test principals.' }, { status: 403 })
    }

    const { data: organizationProjects, error: projectsError } = await admin.schema('app').from('projects')
      .select('id').eq('organization_id', project.organization_id)
    if (projectsError) throw new Error(`Unable to load organization projects: ${projectsError.message}`)
    const organizationProjectIds = (organizationProjects ?? []).map((row) => row.id)

    const credentials: { persona: string; roleKey: string; email: string; password: string; userId: string }[] = []
    const rotatedAt = new Date().toISOString()

    for (const persona of PERSONAS) {
      const email = `persona.${persona.slug}@datanexus.test`
      const nextPassword = password()
      let authUser = await findAuthUserByEmail(admin, email)

      if (!authUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: nextPassword,
          email_confirm: true,
          user_metadata: { display_name: `DataNexus Persona Test: ${persona.slug}` },
          app_metadata: { datanexus_test_principal: true, persona_slug: persona.slug },
        })
        if (error || !data.user) throw new Error(`Unable to create ${persona.slug}: ${error?.message ?? 'unknown auth error'}`)
        authUser = data.user
      } else {
        const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
          password: nextPassword,
          user_metadata: { ...(authUser.user_metadata ?? {}), display_name: `DataNexus Persona Test: ${persona.slug}` },
          app_metadata: { ...(authUser.app_metadata ?? {}), datanexus_test_principal: true, persona_slug: persona.slug },
        })
        if (error || !data.user) throw new Error(`Unable to rotate ${persona.slug}: ${error?.message ?? 'unknown auth error'}`)
        authUser = data.user
      }

      const { error: membershipError } = await admin.schema('app').from('organization_members').upsert({
        organization_id: project.organization_id,
        user_id: authUser.id,
        role: 'MEMBER',
      }, { onConflict: 'organization_id,user_id' })
      if (membershipError) throw new Error(`Unable to set MEMBER tenancy for ${persona.slug}: ${membershipError.message}`)

      if (organizationProjectIds.length) {
        const { error: deactivateError } = await admin.schema('governance').from('project_role_bindings')
          .update({ active: false, expires_at: rotatedAt })
          .eq('user_id', authUser.id)
          .in('project_id', organizationProjectIds)
          .eq('active', true)
        if (deactivateError) throw new Error(`Unable to clear previous persona bindings for ${persona.slug}: ${deactivateError.message}`)
      }

      const { data: binding, error: bindingError } = await admin.schema('governance').from('project_role_bindings').upsert({
        project_id: project.id,
        user_id: authUser.id,
        role_key: persona.roleKey,
        active: true,
        assigned_by: user.id,
        assigned_at: rotatedAt,
        expires_at: null,
      }, { onConflict: 'project_id,user_id,role_key' }).select('id').single()
      if (bindingError) throw new Error(`Unable to bind ${persona.slug}: ${bindingError.message}`)

      await writeGovernanceAudit({
        projectId: project.id,
        actorUserId: user.id,
        eventType: 'PERSONA_TEST_PRINCIPAL_PROVISIONED',
        entityType: 'PROJECT',
        entityId: project.id,
        metadata: {
          target_user_id: authUser.id,
          email,
          persona_slug: persona.slug,
          role_key: persona.roleKey,
          binding_id: binding.id,
          credential_rotated_at: rotatedAt,
        },
      })

      credentials.push({ persona: persona.slug, roleKey: persona.roleKey, email, password: nextPassword, userId: authUser.id })
    }

    return NextResponse.json({
      warning: 'Temporary provisioning surface. Remove this route after credentials are captured and verification is complete.',
      project: { id: project.id, name: project.name, organizationId: project.organization_id },
      rotatedAt,
      count: credentials.length,
      credentials,
    }, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    })
  } catch (error) {
    return errorResponse(error, 'Unable to provision persona test principals.')
  }
}
