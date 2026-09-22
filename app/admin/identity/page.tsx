import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { IdentityManager } from './identity-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function IdentityAdminPage() {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canAdminWorkspace = canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)
  const admin = createAdminClient()
  const { data: memberships, error: membershipError } = await admin.schema('app').from('organization_members')
    .select('organization_id,role').eq('user_id', user.id).in('role', ['OWNER','ADMIN'])
  if (membershipError) throw new Error(`Unable to load enterprise identity administrator memberships: ${membershipError.message}`)
  const organizationIds = (memberships ?? []).map((row) => row.organization_id)
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? await admin.schema('app').from('organizations').select('id,name').in('id', organizationIds).order('name')
    : { data: [], error: null }
  if (organizationsError) throw new Error(`Unable to load enterprise identity organizations: ${organizationsError.message}`)
  const roleByOrganization = new Map((memberships ?? []).map((row) => [row.organization_id, String(row.role) as 'OWNER' | 'ADMIN']))
  const rows = (organizations ?? []).map((organization) => ({ id: organization.id, name: organization.name, currentRole: roleByOrganization.get(organization.id) ?? 'ADMIN' as const }))

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.85),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Enterprise Identity" contextLabel="SSO and SCIM" homeHref="/home" />
      {canAdminWorkspace ? <div className="mb-6 mt-4 flex flex-wrap justify-end gap-2 text-sm"><Link href="/admin" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Organization Admin</Link><Link href="/admin/project-roles" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Project Roles</Link><Link href="/admin/landing-pages" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Landing Pages</Link></div> : null}
      <header className="mb-6 rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><KeyRound className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Identity governance</p><h1 className="text-3xl font-black">Enterprise SSO and SCIM</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Connect SAML-authenticated users to governed organizations and automate membership lifecycle through SCIM 2.0 provisioning.</p></header>
      {rows.length ? <IdentityManager organizations={rows} /> : <section className="rounded-3xl border border-amber-200 bg-white p-8 text-sm text-slate-600 shadow-sm">OWNER or ADMIN access is required to configure enterprise identity.</section>}
    </div>
  </main>
}
