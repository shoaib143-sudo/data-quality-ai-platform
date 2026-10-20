'use client'

import { useState } from 'react'
import { Loader2, Network } from 'lucide-react'

const sample={items:[{id:'external:customer',type:'TABLE',namespace:'sales',name:'customer',description:'Customer master from external catalog',owners:['data-owner@example.com'],tags:['gold','customer'],classifications:['CONFIDENTIAL']}]}

type Project={id:string;name:string;canPersist:boolean}
export function FederationWorkbench({projects}:{projects:Project[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const selectedProject=projects.find(project=>project.id===projectId)
  const [sourceCatalog,setSourceCatalog]=useState('external-catalog')
  const [payload,setPayload]=useState(JSON.stringify(sample,null,2))
  const [result,setResult]=useState<Record<string,unknown>|null>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function persist(){
    setBusy(true);setError('')
    try{
      const records=JSON.parse(payload)
      const response=await fetch('/api/catalog/federation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,sourceCatalog,records})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Federated metadata persistence failed.')
      setResult({...body,mode:'PERSISTED'})
    }catch(cause){setError(cause instanceof Error?cause.message:'Federated metadata persistence failed.')}finally{setBusy(false)}
  }

  async function normalize(){
    setBusy(true);setError('');setResult(null)
    try{
      const records=JSON.parse(payload)
      const response=await fetch('/api/catalog/federation/normalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceCatalog,records})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Federation normalization failed.')
      setResult(body)
    }catch(cause){setError(cause instanceof Error?cause.message:'Federation normalization failed.')}finally{setBusy(false)}
  }

  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><div className="flex items-center gap-2"><Network className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-black">Federation normalization</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">Normalize external catalog metadata into the DataNexus canonical exchange contract before any governed persistence or synchronization.</p><label className="mt-5 block text-xs font-bold text-slate-300">Project<select value={projectId} onChange={e=>setProjectId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="mt-4 block text-xs font-bold text-slate-300">Source catalog<input value={sourceCatalog} onChange={e=>setSourceCatalog(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white"/></label><label className="mt-4 block text-xs font-bold text-slate-300">Metadata payload<textarea value={payload} onChange={e=>setPayload(e.target.value)} rows={20} className="mt-1 w-full rounded-2xl border border-white/10 bg-[#07101c] p-4 font-mono text-xs leading-5 text-slate-200"/></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy||!sourceCatalog.trim()} onClick={()=>void normalize()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Network className="h-4 w-4"/>}Normalize dry run</button><button type="button" disabled={busy||!sourceCatalog.trim()||!projectId||!selectedProject?.canPersist} onClick={()=>void persist()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-50">Persist governed exchange</button></div>{selectedProject&&!selectedProject.canPersist?<p className="mt-2 text-xs text-amber-300">Dry-run normalization is available. catalog.update permission is required to persist the exchange.</p>:null}{error?<p className="mt-3 text-sm text-rose-300">{error}</p>:null}</section><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-wide text-violet-300">Canonical result</p>{result?<><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4"><p className="text-2xl font-black">{String(result.recordCount??0)}</p><p className="text-xs text-slate-500">normalized records</p></div><div className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4"><p className="text-2xl font-black">{String(result.conflictCount??0)}</p><p className="text-xs text-slate-500">authority/conflict findings</p></div></div><pre className="mt-4 max-h-[560px] overflow-auto rounded-2xl border border-white/[0.07] bg-[#07101c] p-4 text-[11px] leading-5 text-slate-300">{JSON.stringify(result,null,2)}</pre></>:<p className="mt-4 text-sm leading-6 text-slate-500">Run a dry normalization to inspect records, provenance authority and conflicts. This workbench intentionally performs no mutation.</p>}</section></div>
}
