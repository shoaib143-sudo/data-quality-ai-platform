import Link from 'next/link'
import { GitBranch, Layers3, ArrowRight } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

export default async function LineagePage(){
  await requireUser()
  const supabase=await createClient()
  const [edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult]=await Promise.all([
    supabase.schema('governance').from('lineage_edges').select('*').order('created_at').limit(500),
    supabase.schema('catalog').from('datasets').select('id,name,project_id'),
    supabase.schema('catalog').from('data_sources').select('id,name,project_id,source_type'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at').order('started_at',{ascending:false}).limit(100),
  ])
  for(const result of [edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult]) if(result.error) throw new Error(result.error.message)
  const datasets=new Map((datasetsResult.data??[]).map(d=>[d.id,d]))
  const sources=new Map((sourcesResult.data??[]).map(s=>[s.id,s]))
  const versions=new Map((versionsResult.data??[]).map(v=>[v.id,v]))
  const runs=new Map((runsResult.data??[]).map(r=>[r.id,r]))
  const label=(type:string,id:string)=>{
    if(type==='DATA_SOURCE')return sources.get(id)?.name??id.slice(0,8)
    if(type==='DATASET')return datasets.get(id)?.name??id.slice(0,8)
    if(type==='DATASET_VERSION'){const v=versions.get(id);return v?`${datasets.get(v.dataset_id)?.name??'Dataset'} v${v.version_number}`:id.slice(0,8)}
    if(type==='PROFILE_RUN'){const r=runs.get(id);return r?`Profile ${id.slice(0,8)} · ${r.status}`:id.slice(0,8)}
    return `${type} ${id.slice(0,8)}`
  }
  const edges=edgesResult.data??[]
  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><Link href="/catalog" className="text-sm font-semibold text-blue-600">Open Catalog</Link></nav>
    <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><GitBranch className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Data Lineage & Impact</h1><p className="mt-1 text-sm text-slate-500">Automatically discovered source, dataset, version, profiling and agent execution relationships.</p></div></div></header>
    <section className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">Edges</p><p className="mt-1 text-3xl font-black">{edges.length}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">Datasets</p><p className="mt-1 text-3xl font-black">{datasets.size}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">Auto discovered</p><p className="mt-1 text-3xl font-black">{edges.filter(e=>e.metadata?.auto_discovered).length}</p></div></section>
    <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Lineage graph</h2><div className="mt-5 space-y-3">{edges.length?edges.map(edge=><div key={edge.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1fr_auto_1fr] md:items-center"><div className="rounded-xl bg-blue-50 p-3"><p className="text-[11px] font-bold uppercase text-blue-500">{edge.source_type}</p><p className="mt-1 font-bold">{label(edge.source_type,edge.source_id)}</p></div><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><span>{edge.relationship}</span><ArrowRight className="h-4 w-4"/></div><div className="rounded-xl bg-violet-50 p-3"><p className="text-[11px] font-bold uppercase text-violet-500">{edge.target_type}</p><p className="mt-1 font-bold">{label(edge.target_type,edge.target_id)}</p></div></div>):<div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">No lineage edges are available.</div>}</div></section>
  </div></main>
}
