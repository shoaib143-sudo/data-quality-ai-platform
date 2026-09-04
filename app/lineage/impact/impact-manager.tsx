'use client'

import { FormEvent, useMemo, useState } from 'react'
import { GitBranch, Loader2, Search, ShieldAlert } from 'lucide-react'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}
type ImpactNode={assetType:string;assetId:string;assetName?:string;distance:number;riskScore:number;confidence:number;criticality?:string;certificationStatus?:string;path:Array<Record<string,unknown>>}
type Result={analysisId:string;projectId:string;rootAssetType:string;rootAssetId:string;direction:string;maxDepth:number;maxEdges:number;graphProvider:string;truncated:boolean;exhausted:boolean;affectedCount:number;criticalAffectedCount:number;riskScore:number;confidence:number;summary:string;nodes:ImpactNode[]}

export function ImpactManager({projects,datasets}:{projects:Project[];datasets:Dataset[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const available=useMemo(()=>datasets.filter(dataset=>dataset.project_id===projectId),[datasets,projectId])
  const [datasetId,setDatasetId]=useState('')
  const [direction,setDirection]=useState<'DOWNSTREAM'|'UPSTREAM'>('DOWNSTREAM')
  const [maxDepth,setMaxDepth]=useState(4)
  const [maxEdges,setMaxEdges]=useState(240)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [result,setResult]=useState<Result|null>(null)
  const selectedId=datasetId&&available.some(dataset=>dataset.id===datasetId)?datasetId:(available[0]?.id??'')

  async function analyze(event:FormEvent){
    event.preventDefault();if(!projectId||!selectedId)return
    setBusy(true);setMessage('')
    try{
      const selected=available.find(dataset=>dataset.id===selectedId)
      const response=await fetch('/api/lineage/impact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,rootAssetType:'DATASET',rootAssetId:selectedId,rootAssetName:selected?.name,direction,maxDepth,maxEdges,triggerType:'USER_REQUEST'})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to analyze lineage impact.')
      setResult(payload as Result)
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to analyze lineage impact.')}finally{setBusy(false)}
  }

  return <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
    <form onSubmit={analyze} className="h-fit rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Search className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-bold">Impact query</h2></div>
      <p className="mt-1 text-sm text-slate-500">Traverse persisted lineage evidence through the bounded GraphProvider without modifying source systems.</p>
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">Project<select value={projectId} onChange={event=>{setProjectId(event.target.value);setDatasetId('');setResult(null)}} className="mt-1 w-full rounded-xl border px-3 py-2.5">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Root dataset<select value={selectedId} onChange={event=>setDatasetId(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{available.map(dataset=><option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Direction<select value={direction} onChange={event=>setDirection(event.target.value as 'DOWNSTREAM'|'UPSTREAM')} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="DOWNSTREAM">Downstream blast radius</option><option value="UPSTREAM">Upstream root dependencies</option></select></label>
        <label className="text-sm font-semibold">Maximum depth<input type="number" min={1} max={4} value={maxDepth} onChange={event=>setMaxDepth(Math.max(1,Math.min(4,Number(event.target.value)||4)))} className="mt-1 w-full rounded-xl border px-3 py-2.5"/><span className="mt-1 block text-[11px] font-normal text-slate-400">Bounded to 4 hops per analysis.</span></label>
        <label className="text-sm font-semibold">Maximum edges<select value={maxEdges} onChange={event=>setMaxEdges(Number(event.target.value))} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value={120}>120 edges</option><option value={240}>240 edges</option><option value={400}>400 edges</option></select></label>
        <button disabled={busy||!selectedId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<GitBranch className="h-4 w-4"/>}Analyze impact</button>
        {message?<p className="text-sm text-red-600">{message}</p>:null}
      </div>
    </form>

    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      {!result?<div className="grid min-h-80 place-items-center text-center"><div><GitBranch className="mx-auto h-12 w-12 text-slate-300"/><h2 className="mt-4 text-xl font-bold">Select a governed dataset</h2><p className="mt-2 max-w-lg text-sm text-slate-500">The analysis follows persisted lineage edges through a bounded provider, prevents cycles, ranks affected assets by governance criticality and path distance, and records evidence for later audit.</p></div></div>:<>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Analysis {result.analysisId.slice(0,8)} · {result.graphProvider}</p><h2 className="mt-1 text-2xl font-black">{result.summary}</h2></div><div className="rounded-2xl bg-violet-50 px-4 py-3 text-right"><p className="text-xs font-bold text-violet-700">Aggregate risk</p><p className="text-2xl font-black text-violet-700">{Math.round(result.riskScore*100)}%</p><p className="text-xs text-slate-500">{Math.round(result.confidence*100)}% confidence</p></div></div>
        {result.truncated?<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">This analysis reached the {result.maxEdges}-edge bound. Results are valid for the explored neighborhood but may not represent the complete estate blast radius.</div>:null}
        <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Affected assets</p><p className="mt-1 text-2xl font-black">{result.affectedCount}</p></div><div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-bold uppercase text-red-600">High or critical</p><p className="mt-1 text-2xl font-black text-red-700">{result.criticalAffectedCount}</p></div><div className="rounded-2xl bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-600">Traversal</p><p className="mt-1 text-lg font-black text-blue-700">{result.direction} · {result.maxDepth} hops</p></div><div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-bold uppercase text-violet-600">Graph bound</p><p className="mt-1 text-lg font-black text-violet-700">{result.maxEdges} edges</p></div></div>
        <div className="mt-5 space-y-3">{result.nodes.length?result.nodes.map((node,index)=><article key={`${node.assetType}:${node.assetId}:${index}`} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{node.assetType}</span><span className="font-bold">{node.assetName??node.assetId.slice(0,8)}</span>{['HIGH','CRITICAL'].includes(String(node.criticality).toUpperCase())?<ShieldAlert className="h-4 w-4 text-red-600"/>:null}</div><p className="mt-1 text-xs text-slate-500">{node.distance} hop{node.distance===1?'':'s'} · {node.criticality??'MEDIUM'} criticality · {node.certificationStatus??'UNCERTIFIED'}</p></div><div className="text-right"><p className="font-black text-violet-700">{Math.round(node.riskScore*100)}% risk</p><p className="text-xs text-slate-500">{Math.round(node.confidence*100)}% confidence</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{node.path.map((step,stepIndex)=><span key={stepIndex} className="rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500">{String(step.relationship??'RELATED')}</span>)}</div></article>):<div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">No dependencies were found within the requested bounded neighborhood.</div>}</div>
      </>}
    </section>
  </div>
}
