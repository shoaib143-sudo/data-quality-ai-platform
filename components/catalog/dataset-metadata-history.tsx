'use client'
import { useEffect, useState } from 'react'
import { History, Loader2, RotateCcw } from 'lucide-react'

type Version={id:string;version_number:number;change_type:string;snapshot:Record<string,unknown>;created_at:string}
type Proposal={id:string;status:string;context:Record<string,unknown>;started_at:string;completed_at:string|null}
export function DatasetMetadataHistory({datasetId,canEdit}:{datasetId:string;canEdit:boolean}){
  const [versions,setVersions]=useState<Version[]>([])
  const [available,setAvailable]=useState(true)
  const [proposals,setProposals]=useState<Proposal[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  async function load(){
    const [historyResponse,proposalResponse]=await Promise.all([
      fetch(`/api/catalog/${datasetId}/history`,{cache:'no-store'}),
      fetch(`/api/catalog/${datasetId}/proposal`,{cache:'no-store'}),
    ])
    const [historyBody,proposalBody]=await Promise.all([historyResponse.json().catch(()=>({})),proposalResponse.json().catch(()=>({}))])
    if(historyResponse.ok){setVersions(historyBody.versions??[]);setAvailable(historyBody.available!==false)}
    if(proposalResponse.ok)setProposals(proposalBody.proposals??[])
  }
  useEffect(()=>{void load()},[datasetId])
  async function applyProposal(instanceId:string){
    if(!canEdit||busy)return
    setBusy(true);setMessage('')
    try{
      const response=await fetch(`/api/catalog/${datasetId}/proposal`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'APPLY',instanceId})})
      const body=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(body.error??'Unable to apply approved metadata proposal.')
      setMessage(body.reused?'Approved metadata proposal was already applied.':'Approved metadata proposal applied and versioned.')
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to apply approved metadata proposal.')}finally{setBusy(false)}
  }

  async function restore(historyId:string){
    if(!canEdit||busy)return
    setBusy(true);setMessage('')
    try{
      const response=await fetch(`/api/catalog/${datasetId}/history`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({historyId})})
      const body=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(body.error??'Unable to propose metadata restore.')
      setMessage(`Metadata restore workflow ${String(body.instanceId??'').slice(0,8)} started. Approval is required before the historic version can be applied.`)
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to propose metadata restore.')}finally{setBusy(false)}
  }
  if(!available)return null
  return <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0b1422] p-4"><div className="flex items-center gap-2"><History className="h-4 w-4 text-cyan-300"/><h3 className="text-sm font-black text-white">Business metadata versions</h3></div><p className="mt-1 text-xs text-slate-500">Every governed metadata write creates immutable history. Restoring a previous state creates another version and never rewrites history.</p>{message?<p role="status" className="mt-3 text-xs text-cyan-200">{message}</p>:null}<div className="mt-3 space-y-2">{versions.slice(0,8).map((v,index)=>{const snapshot=v.snapshot??{};return <article key={v.id} className="rounded-xl border border-white/[0.06] bg-[#102036] p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-black text-slate-300">v{v.version_number}</span><span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-bold text-violet-300">{v.change_type}</span><span className="min-w-0 flex-1 text-[11px] text-slate-500">{new Date(v.created_at).toLocaleString()}</span>{canEdit&&index>0?<button type="button" disabled={busy} onClick={()=>void restore(v.id)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/20 px-2.5 py-1.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50">{busy?<Loader2 className="h-3 w-3 animate-spin"/>:<RotateCcw className="h-3 w-3"/>}Propose restore</button>:null}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span>{String(snapshot.lifecycle_status??'')}</span><span>{String(snapshot.criticality??'')}</span><span>{Array.isArray(snapshot.tags)?snapshot.tags.join(', '):''}</span></div></article>})}{versions.length===0?<p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">No version history is available yet.</p>:null}</div><div className="mt-4 border-t border-white/[0.06] pt-4"><p className="text-xs font-black text-slate-300">Metadata approval workflows</p><div className="mt-2 space-y-2">{proposals.slice(0,6).map(item=>{const ctx=item.context??{};const applied=Boolean(ctx.applied_at);return <div key={item.id} className="rounded-xl border border-white/[0.06] bg-[#102036] p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-black text-violet-300">{item.status}</span><span className="min-w-0 flex-1 text-[10px] text-slate-500">Workflow {item.id.slice(0,8)}</span>{canEdit&&item.status==='APPROVED'&&!applied?<button type="button" disabled={busy} onClick={()=>void applyProposal(item.id)} className="rounded-lg border border-emerald-400/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-50">Apply approved change</button>:null}{applied?<span className="text-[10px] font-bold text-emerald-300">Applied</span>:null}</div><p className="mt-1 text-[10px] text-slate-600">{Object.keys((ctx.proposed&&typeof ctx.proposed==='object'&&!Array.isArray(ctx.proposed)?ctx.proposed:{}) as Record<string,unknown>).join(', ')||'No proposal fields available'}</p></div>})}{!proposals.length?<p className="text-[11px] text-slate-600">No metadata approval workflows for this dataset.</p>:null}</div></div></section>
}
