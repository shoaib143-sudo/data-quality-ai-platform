'use client'

import { useMemo, useState } from 'react'
import { GitCompareArrows } from 'lucide-react'

type Version={id:string;version_number:number;is_current:boolean;structure_hash:string|null;first_seen_at:string;last_seen_at:string;retired_at:string|null}
type Props={assetKey:string;versions:Version[]}

export function MetadataVersionCompare({assetKey,versions}:Props){
  const ordered=useMemo(()=>[...versions].sort((a,b)=>b.version_number-a.version_number),[versions])
  const [left,setLeft]=useState(String(ordered[1]?.version_number??ordered[0]?.version_number??''))
  const [right,setRight]=useState(String(ordered[0]?.version_number??''))
  const a=ordered.find(item=>String(item.version_number)===left)
  const b=ordered.find(item=>String(item.version_number)===right)
  const changes=[
    {label:'Structure hash',from:a?.structure_hash??'N/A',to:b?.structure_hash??'N/A'},
    {label:'State',from:a?.is_current?'CURRENT':'HISTORICAL',to:b?.is_current?'CURRENT':'HISTORICAL'},
    {label:'First seen',from:a?.first_seen_at??'N/A',to:b?.first_seen_at??'N/A'},
    {label:'Last seen',from:a?.last_seen_at??'N/A',to:b?.last_seen_at??'N/A'},
    {label:'Retired',from:a?.retired_at??'N/A',to:b?.retired_at??'N/A'},
  ]
  if(ordered.length<2)return null
  return <details className="mt-4 rounded-xl border border-white/[0.06] bg-[#0b1422] p-3"><summary className="cursor-pointer list-none text-xs font-black text-violet-300"><span className="inline-flex items-center gap-2"><GitCompareArrows className="h-4 w-4"/>Compare versions</span></summary><div className="mt-3"><p className="text-[11px] text-slate-500">{assetKey}</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase text-slate-600">From<select value={left} onChange={e=>setLeft(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#102036] px-2 py-2 text-xs text-white">{ordered.map(v=><option key={v.id} value={v.version_number}>v{v.version_number}</option>)}</select></label><label className="text-[10px] font-bold uppercase text-slate-600">To<select value={right} onChange={e=>setRight(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#102036] px-2 py-2 text-xs text-white">{ordered.map(v=><option key={v.id} value={v.version_number}>v{v.version_number}</option>)}</select></label></div><div className="mt-3 space-y-2">{changes.map(change=><div key={change.label} className="grid gap-1 rounded-lg border border-white/[0.05] p-2 text-[11px] sm:grid-cols-[120px_1fr_1fr]"><span className="font-bold text-slate-500">{change.label}</span><span className="break-all text-slate-400">{change.from}</span><span className={change.from===change.to?'break-all text-slate-500':'break-all font-semibold text-cyan-300'}>{change.to}</span></div>)}</div></div></details>
}
