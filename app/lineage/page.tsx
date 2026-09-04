import Link from 'next/link'
import { ArrowRight, Code2, GitBranch, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function excerpt(value:unknown,max=1500){const text=typeof value==='string'?value.trim():'';return text.length>max?`${text.slice(0,max)}…`:text}

export default async function LineagePage(){
  await requireUser()
  const supabase=await createClient()
  const [edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult,externalAssetsResult,transformationsResult,mappingsResult]=await Promise.all([
    supabase.schema('governance').from('lineage_edges').select('*').order('created_at',{ascending:false}).limit(1000),
    supabase.schema('catalog').from('datasets').select('id,name,project_id'),
    supabase.schema('catalog').from('data_sources').select('id,name,project_id,source_type'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at').order('started_at',{ascending:false}).limit(200),
    supabase.schema('governance').from('lineage_assets').select('id,namespace,name,asset_type,dataset_id').order('last_seen_at',{ascending:false}).limit(2000),
    supabase.schema('governance').from('lineage_transformations').select('id,source_system,name,operation,logic_language,transformation_logic,logic_hash,metadata,last_seen_at').order('last_seen_at',{ascending:false}).limit(1000),
    supabase.schema('governance').from('lineage_column_mappings').select('id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression').order('created_at',{ascending:false}).limit(3000),
  ])
  for(const result of [edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult,externalAssetsResult,transformationsResult,mappingsResult]) if(result.error) throw new Error(result.error.message)

  const datasets=new Map((datasetsResult.data??[]).map(d=>[d.id,d]))
  const sources=new Map((sourcesResult.data??[]).map(s=>[s.id,s]))
  const versions=new Map((versionsResult.data??[]).map(v=>[v.id,v]))
  const runs=new Map((runsResult.data??[]).map(r=>[r.id,r]))
  const externalAssets=new Map((externalAssetsResult.data??[]).map(asset=>[asset.id,asset]))
  const transformations=new Map((transformationsResult.data??[]).map(item=>[item.id,item]))
  const mappingsByTransformation=new Map<string,typeof mappingsResult.data>()
  for(const mapping of mappingsResult.data??[]){const rows=mappingsByTransformation.get(mapping.transformation_id)??[];rows.push(mapping);mappingsByTransformation.set(mapping.transformation_id,rows)}
  const label=(type:string,id:string)=>{
    if(type==='DATA_SOURCE')return sources.get(id)?.name??id.slice(0,8)
    if(type==='DATASET')return datasets.get(id)?.name??id.slice(0,8)
    if(type==='DATASET_VERSION'){const v=versions.get(id);return v?`${datasets.get(v.dataset_id)?.name??'Dataset'} v${v.version_number}`:id.slice(0,8)}
    if(type==='PROFILE_RUN'){const r=runs.get(id);return r?`Profile ${id.slice(0,8)} · ${r.status}`:id.slice(0,8)}
    if(type==='EXTERNAL_ASSET'){const asset=externalAssets.get(id);return asset?`${asset.namespace?`${asset.namespace} · `:''}${asset.name}`:`External ${id.slice(0,8)}`}
    return `${type} ${id.slice(0,8)}`
  }
  const edges=edgesResult.data??[]
  const transformedEdges=edges.filter(edge=>edge.transformation_id)

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50">Open Catalog</Link><Link href="/lineage/ingest" className="rounded-xl bg-violet-600 px-3 py-2 font-semibold text-white">Ingest lineage</Link></div></nav>
    <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><GitBranch className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Data Lineage & Transformation Impact</h1><p className="mt-1 text-sm text-slate-500">Trace source-to-target dependencies together with the SQL, expression, model or operation that produced each downstream asset.</p></div></div></header>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Edges" value={edges.length}/><Stat label="Datasets" value={datasets.size}/><Stat label="External assets" value={externalAssets.size}/><Stat label="Transformations" value={transformations.size}/><Stat label="Mapped columns" value={(mappingsResult.data??[]).length}/>
    </section>

    <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Lineage graph</h2><p className="mt-1 text-sm text-slate-500">Every transformed edge links to persisted transformation evidence when the connected system exposes it.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{transformedEdges.length} edges with operation evidence</span></div><div className="mt-5 space-y-4">{edges.length?edges.map(edge=>{
      const transformation=edge.transformation_id?transformations.get(edge.transformation_id):null
      const mappings=transformation?mappingsByTransformation.get(transformation.id)??[]:[]
      return <article key={edge.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center"><div className="rounded-xl bg-blue-50 p-3"><p className="text-[11px] font-bold uppercase text-blue-500">{edge.source_type}</p><p className="mt-1 font-bold">{label(edge.source_type,edge.source_id)}</p></div><div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500"><span>{edge.relationship}</span><ArrowRight className="h-4 w-4"/></div><div className="rounded-xl bg-violet-50 p-3"><p className="text-[11px] font-bold uppercase text-violet-500">{edge.target_type}</p><p className="mt-1 font-bold">{label(edge.target_type,edge.target_id)}</p></div></div>
        {transformation?<details className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center gap-2"><Code2 className="h-4 w-4 text-violet-600"/><span className="font-bold text-slate-900">{transformation.name??'Transformation'}</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">{transformation.operation}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{transformation.source_system}</span>{transformation.logic_language?<span className="text-xs text-slate-500">{transformation.logic_language}</span>:null}</div><p className="mt-1 text-xs text-slate-500">Logic hash {transformation.logic_hash?.slice(0,16)??'N/A'} · {mappings.length} column mappings</p></summary>
          {transformation.transformation_logic?<pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{excerpt(transformation.transformation_logic)}</pre>:<p className="mt-3 text-sm text-slate-500">The source exposed the operation but not its underlying transformation text.</p>}
          {mappings.length?<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b text-slate-400"><th className="px-2 py-2">Source column</th><th className="px-2 py-2">Operation</th><th className="px-2 py-2">Target column</th><th className="px-2 py-2">Expression</th></tr></thead><tbody>{mappings.map(mapping=><tr key={mapping.id} className="border-b border-violet-100"><td className="px-2 py-2 font-mono">{mapping.source_column??'N/A'}</td><td className="px-2 py-2">{mapping.operation??'MAP'}</td><td className="px-2 py-2 font-mono">{mapping.target_column??'N/A'}</td><td className="max-w-md px-2 py-2 font-mono text-slate-600">{excerpt(mapping.expression,300)||'N/A'}</td></tr>)}</tbody></table></div>:null}
        </details>:null}
      </article>
    }):<div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">No lineage edges are available.</div>}</div></section>
  </div></main>
}

function Stat({label,value}:{label:string;value:number}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>}
