import Link from 'next/link'
import { GitBranch, Layers3, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { AiLineageSuggestions } from '../ai-lineage-suggestions'

export default async function AiLineageSuggestionsPage(){
  await requireUser()
  const supabase=await createClient()
  const {data:projects,error}=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(error)throw new Error(error.message)

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex flex-wrap gap-2 text-sm"><Link href="/lineage" className="rounded-xl px-3 py-2 font-semibold text-violet-600 hover:bg-violet-50">Lineage explorer</Link><Link href="/lineage/impact" className="rounded-xl px-3 py-2 font-semibold text-violet-600 hover:bg-violet-50">Impact analysis</Link><Link href="/lineage/ingest" className="rounded-xl px-3 py-2 font-semibold text-violet-600 hover:bg-violet-50">Ingest observed lineage</Link></div></nav>
    <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Sparkles className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">AI Lineage Suggestion Workspace</h1><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">Generate metadata-derived dependency candidates, review them under lineage authority, and optionally promote accepted candidates as explicitly human-confirmed inferred dependencies. Source-observed lineage remains a separate evidence class.</p></div></div></header>
    <AiLineageSuggestions projects={(projects??[]).map(project=>({id:String(project.id),name:String(project.name)}))}/>
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><div className="flex items-start gap-3"><GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-violet-600"/><div><p className="font-black text-slate-800">Module #3 remains externally blocked</p><p className="mt-1 text-xs leading-5">AI inference does not satisfy <code>REAL_FIELD_LINEAGE_DATA_NOT_INGESTED</code>. Databricks source-authoritative table and column lineage still requires <code>USE SCHEMA</code> on <code>system.access</code>.</p></div></div></div>
  </div></main>
}
