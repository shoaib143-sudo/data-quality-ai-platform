'use client'

import { useState } from 'react'
import { DatabaseZap, FileSearch, Loader2, PlayCircle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Source={id:string;project_id:string;name:string;source_type:string;status:string}
type Run={id:string;project_id:string;source_id:string;status:string;assets_discovered:number;error_message:string|null;started_at:string;completed_at:string|null}

export function DiscoveryManager({sources,runs}:{sources:Source[];runs:Run[]}){
  const router=useRouter()
  const [busy,setBusy]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  async function discover(sourceId:string){
    setBusy(sourceId);setMessage('')
    try{
      const idempotencyKey=crypto.randomUUID()
      const response=await fetch('/api/catalog/discovery',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({sourceId,idempotencyKey})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to queue discovery.')
      setMessage('Metadata discovery queued. The durable worker will scan and persist source assets.')
      setTimeout(()=>router.refresh(),1500)
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to queue discovery.')}finally{setBusy(null)}
  }
  const latestBySource=new Map<string,Run>()
  for(const run of runs)if(!latestBySource.has(run.source_id))latestBySource.set(run.source_id,run)
  return <div className="mt-6 space-y-6">
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.map(source=>{const run=latestBySource.get(source.id);return <article key={source.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">{source.source_type==='JDBC'?<DatabaseZap className="h-5 w-5"/>:<FileSearch className="h-5 w-5"/>}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${source.status==='ACTIVE'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{source.status}</span></div><h3 className="mt-4 font-bold">{source.name}</h3><p className="mt-1 text-xs text-slate-500">{source.source_type}</p>{run?<div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><div className="font-bold">{run.status} · {run.assets_discovered} assets</div><div className="mt-1">{new Date(run.started_at).toLocaleString()}</div>{run.error_message?<div className="mt-1 text-red-600">{run.error_message}</div>:null}</div>:<p className="mt-4 text-xs text-slate-400">No discovery run yet.</p>}<button onClick={()=>void discover(source.id)} disabled={busy===source.id} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy===source.id?<Loader2 className="h-4 w-4 animate-spin"/>:<PlayCircle className="h-4 w-4"/>}Discover metadata</button></article>})}</section>
    {message?<p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p>:null}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-bold">Discovery history</h2></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Source</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Assets</th><th className="px-3 py-2">Started</th><th className="px-3 py-2">Completed</th></tr></thead><tbody>{runs.map(run=><tr key={run.id} className="border-b border-slate-100"><td className="px-3 py-3 font-semibold">{sources.find(source=>source.id===run.source_id)?.name??run.source_id}</td><td className="px-3 py-3">{run.status}</td><td className="px-3 py-3">{run.assets_discovered}</td><td className="px-3 py-3 text-slate-500">{new Date(run.started_at).toLocaleString()}</td><td className="px-3 py-3 text-slate-500">{run.completed_at?new Date(run.completed_at).toLocaleString():'—'}</td></tr>)}</tbody></table></div></section>
  </div>
}
