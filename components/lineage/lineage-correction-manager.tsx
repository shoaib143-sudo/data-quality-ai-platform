'use client'
import { useEffect, useState } from 'react'
import { GitBranch, Loader2, RefreshCw } from 'lucide-react'

type Project={id:string;name:string}
type Asset={id:string;namespace:string|null;name:string;asset_type:string}
type Correction={id:string;status:string;context:Record<string,unknown>;started_at:string;completed_at:string|null}

export function LineageCorrectionManager({projects}:{projects:Project[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [assets,setAssets]=useState<Asset[]>([])
  const [corrections,setCorrections]=useState<Correction[]>([])
  const [sourceId,setSourceId]=useState('')
  const [targetId,setTargetId]=useState('')
  const [relationship,setRelationship]=useState('TRANSFORMS_TO')
  const [sourceColumn,setSourceColumn]=useState('')
  const [targetColumn,setTargetColumn]=useState('')
  const [expression,setExpression]=useState('')
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  async function load(){
    if(!projectId)return
    const response=await fetch(`/api/lineage/corrections?projectId=${encodeURIComponent(projectId)}`,{cache:'no-store'})
    const body=await response.json()
    if(response.ok){setAssets(body.assets??[]);setCorrections(body.corrections??[])}
  }
  useEffect(()=>{void load()},[projectId])

  async function propose(){
    setBusy(true);setMessage('')
    try{
      const response=await fetch('/api/lineage/corrections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'PROPOSE',projectId,sourceAssetId:sourceId,targetAssetId:targetId,sourceColumn,targetColumn,expression,relationship,note})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Unable to propose lineage correction.')
      setMessage(`Correction workflow ${String(body.instanceId).slice(0,8)} started. Approve it in Issues & Approvals before applying.`)
      setSourceColumn('');setTargetColumn('');setExpression('');setNote('');await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to propose lineage correction.')}finally{setBusy(false)}
  }
  async function apply(instanceId:string){
    setBusy(true);setMessage('')
    try{
      const response=await fetch('/api/lineage/corrections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'APPLY',instanceId})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Unable to apply lineage correction.')
      setMessage(body.reused?'Approved correction was already applied.':'Approved correction applied as governed manual lineage evidence.')
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to apply lineage correction.')}finally{setBusy(false)}
  }
  const label=(id:string)=>{const a=assets.find(item=>item.id===id);return a?[a.namespace,a.name].filter(Boolean).join('.')||a.name:id.slice(0,8)}
  return <div className="space-y-5"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-black">Propose lineage correction</h2></div><p className="mt-2 max-w-3xl text-sm text-slate-500">Manual lineage changes are approval-gated. The proposal creates no lineage edge until the workflow reaches APPROVED and an authorized user applies it.</p></div><label className="text-xs font-bold text-slate-600">Project<select value={projectId} onChange={e=>setProjectId(e.target.value)} className="mt-1 block min-w-64 rounded-xl border px-3 py-2.5">{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">Source asset<select value={sourceId} onChange={e=>setSourceId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">Select source</option>{assets.map(a=><option key={a.id} value={a.id}>{[a.namespace,a.name].filter(Boolean).join('.')}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Target asset<select value={targetId} onChange={e=>setTargetId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">Select target</option>{assets.map(a=><option key={a.id} value={a.id}>{[a.namespace,a.name].filter(Boolean).join('.')}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Relationship<input value={relationship} onChange={e=>setRelationship(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-xs font-bold text-slate-600">Rationale<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Why is this correction needed?" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-xs font-bold text-slate-600">Source column (optional)<input value={sourceColumn} onChange={e=>setSourceColumn(e.target.value)} placeholder="customer_id" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-xs font-bold text-slate-600">Target column (optional)<input value={targetColumn} onChange={e=>setTargetColumn(e.target.value)} placeholder="customer_key" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Transformation expression (optional)<textarea value={expression} onChange={e=>setExpression(e.target.value)} rows={3} placeholder="CAST(source.customer_id AS STRING)" className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-xs"/></label></div><button type="button" disabled={busy||!sourceId||!targetId||!note.trim()||Boolean(sourceColumn.trim())!==Boolean(targetColumn.trim())} onClick={()=>void propose()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<GitBranch className="h-4 w-4"/>}Submit correction for approval</button>{message?<p role="status" className="mt-3 text-sm text-slate-600">{message}</p>:null}</section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Correction workflows</h2><button type="button" onClick={()=>void load()} className="rounded-xl border p-2 text-slate-500"><RefreshCw className="h-4 w-4"/></button></div><div className="mt-4 space-y-2">{corrections.map(item=>{const ctx=item.context??{};const applied=Boolean(ctx.applied_at);return <article key={item.id} className="rounded-2xl border bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{item.status}</span><span className="min-w-0 flex-1 text-sm font-bold">{label(String(ctx.source_asset_id??''))} → {label(String(ctx.target_asset_id??''))}</span><span className="text-xs text-slate-500">{String(ctx.relationship??'TRANSFORMS_TO')}</span>{item.status==='APPROVED'&&!applied?<button type="button" disabled={busy} onClick={()=>void apply(item.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Apply approved correction</button>:null}{applied?<span className="text-xs font-bold text-emerald-600">Applied</span>:null}</div><p className="mt-2 text-xs text-slate-500">{String(ctx.note??'')}</p>{ctx.source_column&&ctx.target_column?<p className="mt-1 text-xs font-semibold text-cyan-700">Column mapping: {String(ctx.source_column)} → {String(ctx.target_column)}{ctx.expression?` · ${String(ctx.expression)}`:''}</p>:null}</article>})}{!corrections.length?<p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No manual correction workflows exist for this project.</p>:null}</div></section></div>
}
