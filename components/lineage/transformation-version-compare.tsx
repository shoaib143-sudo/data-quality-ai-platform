'use client'

import { useMemo, useState } from 'react'
import { GitCompareArrows } from 'lucide-react'

type Row={
  id:string
  transformation_id:string
  version_number:number
  source_system:string
  name:string|null
  operation:string
  logic_language:string|null
  transformation_logic:string|null
  logic_hash:string|null
  observed_at:string
  change_type:string
}

function value(v:unknown){return v==null||v===''?'N/A':String(v)}
function logic(v:string|null){return v?.trim()||'No persisted transformation expression.'}

export function TransformationVersionCompare({rows}:{rows:Row[]}){
  const groups=useMemo(()=>{
    const map=new Map<string,Row[]>()
    for(const row of rows)map.set(row.transformation_id,[...(map.get(row.transformation_id)??[]),row])
    return [...map.entries()].map(([id,versions])=>({id,versions:[...versions].sort((a,b)=>b.version_number-a.version_number)})).filter(item=>item.versions.length>1)
  },[rows])
  const [selected,setSelected]=useState(groups[0]?.id??'')
  const group=groups.find(item=>item.id===selected)??groups[0]
  const [fromVersion,setFromVersion]=useState<number|null>(null)
  const [toVersion,setToVersion]=useState<number|null>(null)

  if(!group)return <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">At least two persisted versions of the same transformation are required for comparison.</p>

  const versions=group.versions
  const from=versions.find(row=>row.version_number===(fromVersion??versions[1]?.version_number))??versions[1]??versions[0]
  const to=versions.find(row=>row.version_number===(toVersion??versions[0]?.version_number))??versions[0]
  const fields=[
    ['Source system',value(from.source_system),value(to.source_system)],
    ['Operation',value(from.operation),value(to.operation)],
    ['Logic language',value(from.logic_language),value(to.logic_language)],
    ['Logic hash',value(from.logic_hash),value(to.logic_hash)],
    ['Expression',logic(from.transformation_logic),logic(to.transformation_logic)],
  ] as const

  return <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4">
    <div className="flex flex-wrap items-center gap-3"><GitCompareArrows className="h-5 w-5 text-violet-300"/><div className="min-w-0 flex-1"><p className="font-black text-white">Compare transformation versions</p><p className="text-xs text-slate-500">Compare immutable persisted observations without changing source evidence.</p></div><select value={group.id} onChange={event=>{setSelected(event.target.value);setFromVersion(null);setToVersion(null)}} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 text-xs text-slate-200">{groups.map(item=><option key={item.id} value={item.id}>{item.versions[0]?.name??item.id.slice(0,8)} · {item.versions.length} versions</option>)}</select></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wide text-slate-600">From<select value={from.version_number} onChange={event=>setFromVersion(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 text-xs text-slate-200">{versions.map(row=><option key={row.id} value={row.version_number}>v{row.version_number} · {row.change_type}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-600">To<select value={to.version_number} onChange={event=>setToVersion(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 text-xs text-slate-200">{versions.map(row=><option key={row.id} value={row.version_number}>v{row.version_number} · {row.change_type}</option>)}</select></label></div>
    <div className="mt-4 space-y-2">{fields.map(([label,a,b])=><div key={label} className="grid gap-2 rounded-xl border border-white/[0.05] bg-[#08182b] p-3 text-xs lg:grid-cols-[130px_1fr_1fr]"><span className="font-black text-slate-500">{label}</span><span className="whitespace-pre-wrap break-all text-slate-400">{a}</span><span className={a===b?'whitespace-pre-wrap break-all text-slate-500':'whitespace-pre-wrap break-all font-semibold text-cyan-300'}>{b}</span></div>)}</div>
  </div>
}
