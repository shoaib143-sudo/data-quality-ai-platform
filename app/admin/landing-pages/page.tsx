import Link from 'next/link'
import { Eye, EyeOff, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { personas, personaSlugs } from '@/lib/governance/personas'
import { setLandingPageEnabled } from './actions'

export default async function LandingPageAdministrationPage() {
  const user = await requireUser()
  const admin = createAdminClient()

  const membershipsResult = await admin.schema('app').from('organization_members')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ADMIN'])

  if (membershipsResult.error) throw new Error(`Unable to load administrator memberships: ${membershipsResult.error.message}`)
  const organizationIds = (membershipsResult.data ?? []).map(row => row.organization_id)

  if (!organizationIds.length) {
    return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-4xl rounded-3xl bg-[#eef2f7] p-8 shadow-[10px_10px_28px_#cbd2dc,-10px_-10px_28px_#ffffff]"><ShieldCheck className="h-8 w-8 text-amber-600"/><h1 className="mt-4 text-2xl font-black">Landing page administration</h1><p className="mt-2 text-slate-600">OWNER or ADMIN membership is required.</p><Link href="/home" className="mt-6 inline-block text-sm font-bold text-blue-600">Return home</Link></div></main>
  }

  const [organizationsResult, settingsResult] = await Promise.all([
    admin.schema('app').from('organizations').select('id,name').in('id', organizationIds).order('name'),
    admin.schema('governance').from('landing_page_settings').select('organization_id,persona_slug,enabled,updated_at').in('organization_id', organizationIds),
  ])

  if (organizationsResult.error) throw new Error(`Unable to load organizations: ${organizationsResult.error.message}`)
  if (settingsResult.error) throw new Error(`Unable to load landing page settings: ${settingsResult.error.message}`)

  const settings = new Map((settingsResult.data ?? []).map(row => [`${row.organization_id}:${row.persona_slug}`, Boolean(row.enabled)]))

  return <main className="min-h-screen bg-[#eef2f7] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#eef2f7] px-5 py-4 shadow-[8px_8px_22px_#cbd2dc,-8px_-8px_22px_#ffffff]"><Link href="/admin" className="font-black">DataNexus Administration</Link><div className="flex gap-2 text-sm"><Link href="/admin/project-roles" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 hover:text-blue-700">Project Roles</Link><Link href="/home" className="rounded-2xl px-4 py-2 font-semibold text-slate-600 hover:text-blue-700">Role Home</Link></div></nav>

      <header className="rounded-[2rem] bg-[#eef2f7] p-8 shadow-[12px_12px_30px_#cbd2dc,-12px_-12px_30px_#ffffff]"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#eef2f7] text-blue-600 shadow-[inset_3px_3px_8px_#cbd2dc,inset_-3px_-3px_8px_#ffffff]"><LayoutDashboard className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Experience controls</p><h1 className="mt-1 text-3xl font-black">Role landing pages</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Choose which role experiences are available in each organization. Disabling a landing page prevents users assigned to that persona from opening it. Role authorization is still enforced separately.</p></div></div></header>

      <div className="mt-8 space-y-8">{(organizationsResult.data ?? []).map(organization => <section key={organization.id} className="rounded-[2rem] bg-[#eef2f7] p-6 shadow-[10px_10px_26px_#cbd2dc,-10px_-10px_26px_#ffffff]"><div className="mb-5"><h2 className="text-xl font-black">{organization.name}</h2><p className="mt-1 text-sm text-slate-500">Enable only the landing experiences this organization wants to expose.</p></div><div className="grid gap-4 lg:grid-cols-2">{personaSlugs.map(slug => {
        const persona = personas[slug]
        const enabled = settings.get(`${organization.id}:${slug}`) ?? true
        return <div key={slug} className="flex items-center gap-4 rounded-3xl bg-[#eef2f7] p-5 shadow-[inset_2px_2px_7px_#d2d8e1,inset_-2px_-2px_7px_#ffffff]"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{enabled ? <Eye className="h-5 w-5"/> : <EyeOff className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{persona.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{enabled ? 'Enabled' : 'Disabled'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{persona.focus}</p></div><form action={setLandingPageEnabled}><input type="hidden" name="organizationId" value={organization.id}/><input type="hidden" name="personaSlug" value={slug}/><input type="hidden" name="enabled" value={enabled ? 'false' : 'true'}/><button type="submit" className={`min-w-24 rounded-2xl px-4 py-2 text-sm font-bold shadow-[5px_5px_12px_#cbd2dc,-5px_-5px_12px_#ffffff] active:shadow-[inset_3px_3px_7px_#cbd2dc,inset_-3px_-3px_7px_#ffffff] ${enabled ? 'text-slate-600' : 'text-blue-700'}`}>{enabled ? 'Disable' : 'Enable'}</button></form></div>
      })}</div></section>)}</div>
    </div>
  </main>
}
