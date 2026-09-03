import Link from 'next/link'
import { GitBranchPlus } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { LineageIngestManager } from './lineage-ingest-manager'

export default async function LineageIngestPage() {
  await requireUser()
  const supabase = await createClient()
  const { data: projects, error } = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (error) throw new Error(`Unable to load lineage projects: ${error.message}`)
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="font-black">Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/lineage" className="rounded-xl px-3 py-2 font-semibold text-violet-700 hover:bg-violet-50">Lineage graph</Link><Link href="/catalog/discovery" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Discovery</Link></div></nav>
    <header className="mb-6 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><GitBranchPlus className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Lineage integrations</p><h1 className="text-3xl font-black">Lineage Ingestion</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Capture upstream and downstream relationships from orchestration, transformation and query execution systems using retry-safe lineage events.</p></header>
    {projects?.length ? <LineageIngestManager projects={projects} /> : <section className="rounded-3xl border bg-white p-8 text-sm text-slate-500">No accessible projects are available.</section>}
  </div></main>
}
