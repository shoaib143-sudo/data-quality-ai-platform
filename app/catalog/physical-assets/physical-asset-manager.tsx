'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Search, ShieldCheck, Sparkles, UserCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Asset = { id:string; source_id:string; identity_key:string|null; asset_key:string; asset_type:string; namespace:string|null; name:string; version_number:number; last_seen_at:string|null; metadata:unknown }
type Trust = { project_id:string; source_id:string; identity_key:string; asset_key:string; presence_state:string; last_seen_at:string|null; trust_score:number; dimensions:unknown; explanation:string; certification_state:string }
type Promotion = { id:string; project_id:string; source_id:string; identity_key:string; status:string; recommendation_source:string; confidence:number|null; rationale:string|null; requested_at:string|null; decided_at:string|null; decision_reason:string|null; dataset_id:string|null; updated_at:string }
type Source = { id:string; project_id:string; name:string; source_type:string; status:string }

function score(value:number|undefined){return typeof value==='number'?`${Math.round(value*100)}%`:'—'}
function formatDate(value:string|null|undefined){return value?new Date(value).toLocaleString():'—'}
function tone(value:number){return value>=.85?'bg-emerald-50 text-emerald-700 border-emerald-200':value>=.65?'bg-blue-50 text-blue-700 border-blue-200':value>=.45?'bg-amber-50 text-amber-800 border-amber-200':'bg-rose-50 text-rose-700 border-rose-200'}
function statusTone(value:string){const status=value.toUpperCase();if(status==='PROMOTED'||status==='APPROVED')return'bg-emerald-50 text-emerald-700';if(status==='REJECTED')return'bg-rose-50 text-rose-700';if(status==='REQUESTED')return'bg-blue-50 text-blue-700';return'bg-violet-50 text-violet-700'}
function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{} }

export function PhysicalAssetManager({assets,trust,requests,sources}:{assets:Asset[];trust:Trust[];requests:Promotion[];sources:Source[]}){
  const router=useRouter()
  const [query,setQuery]=useState('')
  const [sourceFilter,setSourceFilter]=useState('ALL')
  const [busy,setBusy]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  const trustByIdentity=useMemo(()=>new Map(trust.map(item=>[`${item.source_id}:${item.identity_key}`,item])),[trust])
  const requestByIdentity=useMemo(()=>{
    const result=new Map<string,Promotion>()
    for(const item of requests)if(!result.has(`${item.source_id}:${item.identity_key}`))result.set(`${item.source_id}:${item.identity_key}`,item)
    return result
  },[requests])
  const sourceById=useMemo(()=>new Map(sources.map(source=>[source.id,source])),[sources])
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return assets.filter(asset=>{
      if(sourceFilter!=='ALL'&&asset.source_id!==sourceFilter)return false
      const source=sourceById.get(asset.source_id)
      if(!q)return true
      return [asset.asset_key,asset.asset_type,asset.namespace??'',asset.name,source?.name??''].join(' ').toLowerCase().includes(q)
    })
  },[assets,query,sourceFilter,sourceById])

  async function action(body:Record<string,unknown>,key:string){
    setBusy(key);setMessage('')
    try{
      const response=await fetch('/api/catalog/promotions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Asset promotion action failed.')
      setMessage(body.action==='REQUEST'?'Promotion request created for human governance review.':body.action==='DECIDE'?`Promotion ${String(body.decision).toLowerCase()}.`:'Approved physical asset promoted into the governed catalog.')
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Asset promotion action failed.')}finally{setBusy(null)}
  }

  return <div className="mt-6 space-y-5">
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Published physical assets</p><p className="mt-1 text-2xl font-black">{assets.length}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Promotion requests</p><p className="mt-1 text-2xl font-black">{requests.filter(item=>['RECOMMENDED','REQUESTED','APPROVED'].includes(item.status)).length}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Governed promotions</p><p className="mt-1 text-2xl font-black">{requests.filter(item=>item.status==='PROMOTED').length}</p></div></section>
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-950"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-black">Trust is evidence, not certification</p><p className="mt-1 text-xs leading-5 text-emerald-900/80">The trust score is computed from physical presence, observation recency, identity strength and source annotation completeness. Every dimension is inspectable. Certification remains a separate human-governed authority model.</p></div></div></section>
    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_240px]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search physical asset, source or type…" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"/></label><select value={sourceFilter} onChange={event=>setSourceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="ALL">All sources</option>{sources.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}</select></div></section>
    {message&&<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{message}</div>}
    <section className="space-y-3">{filtered.map(asset=>{
      const identity=asset.identity_key??`qualified:${asset.asset_key}`
      const trustItem=trustByIdentity.get(`${asset.source_id}:${identity}`)
      const promotion=requestByIdentity.get(`${asset.source_id}:${identity}`)
      const source=sourceById.get(asset.source_id)
      const dimensions=record(trustItem?.dimensions)
      return <article key={`${asset.source_id}:${identity}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-all font-black text-slate-900">{asset.asset_key}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{asset.asset_type}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">v{asset.version_number}</span>{identity.startsWith('native:')&&<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">stable native identity</span>}</div><p className="mt-1 text-xs text-slate-500">{source?.name??asset.source_id} · last observed {formatDate(asset.last_seen_at)}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{identity}</p></div><div className="flex flex-wrap items-center gap-2">{trustItem&&<span className={`rounded-full border px-3 py-1 text-xs font-black ${tone(Number(trustItem.trust_score))}`}>Trust {score(Number(trustItem.trust_score))}</span>}{promotion&&<span className={`rounded-full px-3 py-1 text-xs font-black ${statusTone(promotion.status)}`}>{promotion.status}</span>}</div></div>
        {trustItem&&<details className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-black text-slate-700">Explain trust evidence</summary><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">{Object.entries(dimensions).map(([key,value])=>{const item=record(value);return <div key={key} className="rounded-xl border bg-white p-3"><p className="font-bold capitalize text-slate-500">{key.replaceAll('_',' ')}</p><p className="mt-1 text-lg font-black">{score(Number(item.score))}</p><p className="mt-1 break-words text-[10px] text-slate-400">weight {item.weight!==undefined?String(item.weight):'—'}</p></div>})}</div><p className="mt-3 text-xs text-slate-500">{trustItem.explanation} Certification: <strong>{trustItem.certification_state}</strong>.</p></details>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!promotion&&source&&<button disabled={busy===identity} onClick={()=>void action({action:'REQUEST',projectId:source.project_id,sourceId:asset.source_id,identityKey:identity,rationale:'Human-requested promotion from published physical metadata.'},identity)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><UserCheck className="h-4 w-4"/>Request governed promotion</button>}
          {promotion?.status==='RECOMMENDED'&&source&&<button disabled={busy===promotion.id} onClick={()=>void action({action:'REQUEST',projectId:source.project_id,sourceId:asset.source_id,identityKey:identity,rationale:promotion.rationale},promotion.id)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Sparkles className="h-4 w-4"/>Accept AI recommendation for review</button>}
          {promotion?.status==='REQUESTED'&&<><button disabled={busy===promotion.id} onClick={()=>void action({action:'DECIDE',requestId:promotion.id,decision:'APPROVED',reason:'Approved by authorized steward.'},promotion.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>Approve</button><button disabled={busy===promotion.id} onClick={()=>void action({action:'DECIDE',requestId:promotion.id,decision:'REJECTED',reason:'Rejected by authorized steward.'},promotion.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50"><CircleAlert className="h-4 w-4"/>Reject</button></>}
          {promotion?.status==='APPROVED'&&<button disabled={busy===promotion.id} onClick={()=>void action({action:'PROMOTE',requestId:promotion.id},promotion.id)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><UserCheck className="h-4 w-4"/>Promote to governed catalog</button>}
          {promotion?.status==='PROMOTED'&&<span className="text-xs font-bold text-emerald-700">Governed dataset {promotion.dataset_id?.slice(0,8)??''}</span>}
        </div>
      </article>})}{!filtered.length&&<div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">No published physical assets match this filter.</div>}</section>
  </div>
}
