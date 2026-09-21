import Link from 'next/link'
import type { ReactNode } from 'react'
import { Cloud, Database, HardDrive, Server, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type StorageRow = {
  provider: 'supabase' | 'r2'
  state: string
  size_bytes: number | null
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function StatusPill({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{children}</span>
}

export default async function InfrastructurePage() {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: memberships, error: membershipError } = await admin
    .schema('app')
    .from('organization_members')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ADMIN'])
  if (membershipError) throw new Error(`Unable to load infrastructure administrator memberships: ${membershipError.message}`)

  const organizationIds = (memberships ?? []).map((row) => row.organization_id)
  if (!organizationIds.length) {
    return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-4xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-8 w-8 text-amber-600"/><h1 className="mt-4 text-2xl font-black">Infrastructure integration</h1><p className="mt-2 text-slate-600">OWNER or ADMIN membership is required to view infrastructure status.</p><Link href="/home" className="mt-6 inline-block text-sm font-bold text-blue-600">Return home</Link></div></main>
  }

  const { data: projects, error: projectError } = await admin
    .schema('app')
    .from('projects')
    .select('id,name')
    .in('organization_id', organizationIds)
  if (projectError) throw new Error(`Unable to load infrastructure projects: ${projectError.message}`)

  const projectIds = (projects ?? []).map((project) => project.id)
  const storageResult = projectIds.length
    ? await admin.schema('catalog').from('storage_objects').select('provider,state,size_bytes').in('project_id', projectIds).limit(10000)
    : { data: [] as StorageRow[], error: null }
  if (storageResult.error) throw new Error(`Unable to load infrastructure storage inventory: ${storageResult.error.message}`)

  const rows = (storageResult.data ?? []) as StorageRow[]
  const storage = rows.reduce((summary, row) => {
    const provider = row.provider === 'r2' ? 'r2' : 'supabase'
    summary[provider].objects += 1
    summary[provider].bytes += Number(row.size_bytes ?? 0)
    if (row.state === 'READY') summary[provider].ready += 1
    return summary
  }, {
    supabase: { objects: 0, ready: 0, bytes: 0 },
    r2: { objects: 0, ready: 0, bytes: 0 },
  })

  const r2EnvNames = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_PREFIX']
  const r2RuntimeConfigured = r2EnvNames.every((name) => Boolean(process.env[name]?.trim()))
  const r2Default = process.env.STORAGE_DEFAULT_PROVIDER?.trim().toLowerCase() === 'r2'
  const r2Bulk = process.env.STORAGE_BULK_PROVIDER?.trim().toLowerCase() === 'r2'
  const productionCutoverApproved = process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
  const platform = process.env.VERCEL === '1' ? 'Vercel' : (process.env.DATANEXUS_PLATFORM ?? 'Unknown runtime')

  return <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,_rgba(219,234,254,0.8),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_60%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-5 py-3 shadow-sm">
        <Link href="/home" className="font-black">DataNexus</Link>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin" className="rounded-xl px-3 py-2 font-semibold text-slate-700 hover:bg-blue-50">Organization Access</Link>
          <Link href="/admin/infrastructure" aria-current="page" className="rounded-xl bg-blue-50 px-3 py-2 font-semibold text-blue-700">Infrastructure</Link>
        </div>
      </nav>

      <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Infrastructure integration</p>
        <h1 className="mt-2 text-3xl font-black">Runtime and storage convergence</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">Read-only operational view of the Vercel, Supabase and Cloudflare R2 integration boundary. Secrets are never rendered. Cloudflare deployment activation remains governed through protected release workflows.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><Server className="h-5 w-5"/><p className="mt-3 text-xs font-bold uppercase text-slate-500">Primary runtime</p><p className="mt-1 text-xl font-black">{platform}</p><StatusPill ready={platform === 'Vercel'}>{platform === 'Vercel' ? 'active' : 'verify runtime'}</StatusPill></article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><Database className="h-5 w-5"/><p className="mt-3 text-xs font-bold uppercase text-slate-500">Supabase objects</p><p className="mt-1 text-xl font-black">{storage.supabase.objects}</p><p className="mt-1 text-sm text-slate-500">{bytesLabel(storage.supabase.bytes)} · {storage.supabase.ready} ready</p></article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><HardDrive className="h-5 w-5"/><p className="mt-3 text-xs font-bold uppercase text-slate-500">R2 objects</p><p className="mt-1 text-xl font-black">{storage.r2.objects}</p><p className="mt-1 text-sm text-slate-500">{bytesLabel(storage.r2.bytes)} · {storage.r2.ready} ready</p></article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm"><Cloud className="h-5 w-5"/><p className="mt-3 text-xs font-bold uppercase text-slate-500">R2 runtime config</p><div className="mt-2"><StatusPill ready={r2RuntimeConfigured}>{r2RuntimeConfigured ? 'configured' : 'incomplete'}</StatusPill></div><p className="mt-2 text-sm text-slate-500">Configuration presence only. Credential values are intentionally hidden.</p></article>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Storage cutover state</h2>
        <p className="mt-1 text-sm text-slate-500">Production cutover remains explicit and fail-closed.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-500">Default provider</p><p className="mt-2 text-lg font-black">{r2Default ? 'Cloudflare R2' : 'Supabase Storage'}</p></article>
          <article className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-500">Bulk provider</p><p className="mt-2 text-lg font-black">{r2Bulk ? 'Cloudflare R2' : 'Default provider'}</p></article>
          <article className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-500">Production R2 cutover</p><div className="mt-2"><StatusPill ready={productionCutoverApproved}>{productionCutoverApproved ? 'approved' : 'not approved'}</StatusPill></div></article>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Architecture boundary</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p className="rounded-xl bg-slate-50 p-4"><strong>Vercel</strong><br/>Primary interactive Next.js runtime and user-facing API surface.</p>
          <p className="rounded-xl bg-slate-50 p-4"><strong>Supabase</strong><br/>Transactional PostgreSQL, Auth, RLS, governance state and storage registry authority.</p>
          <p className="rounded-xl bg-slate-50 p-4"><strong>Cloudflare</strong><br/>Secondary canary and worker runtime, activated only through governed release workflows.</p>
          <p className="rounded-xl bg-slate-50 p-4"><strong>Cloudflare R2</strong><br/>Provider-neutral dataset and large-object storage target with explicit production cutover gates.</p>
        </div>
      </section>
    </div>
  </main>
}
