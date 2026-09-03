'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { Loader2, Search, Tag } from 'lucide-react'

type Result={kind:string;id:string;projectId:string;label:string;description:string|null;href:string;score:number;metadata:Record<string,unknown>}

export function GlobalSearch(){
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<Result[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('Search across datasets, glossary terms, issues, classifications, policies and data contracts.')

  async function search(event:FormEvent){
    event.preventDefault();if(query.trim().length<2)return
    setBusy(true);setMessage('')
    try{
      const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{cache:'no-store'})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Search failed.')
      setResults(payload.results??[])
      setMessage(`${payload.count??0} governed results found.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Search failed.')}finally{setBusy(false)}
  }

  const grouped=results.reduce<Record<string,Result[]>>((groups,result)=>{(groups[result.kind]??=[]).push(result);return groups},{})
  return <div className="mt-6 space-y-6">
    <form onSubmit={search} className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><label className="relative block"><Search className="absolute left-4 top-4 h-5 w-5 text-slate-400"/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search customer, revenue, PII, quality issue, contract…" className="w-full rounded-2xl border border-slate-200 py-3.5 pl-12 pr-32 text-base outline-none focus:border-blue-300"/><button disabled={busy||query.trim().length<2} className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}Search</button></label><p className="mt-3 text-sm text-slate-500">{message}</p></form>
    {Object.entries(grouped).map(([kind,items])=><section key={kind} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tag className="h-4 w-4 text-violet-600"/><h2 className="font-bold">{kind.replaceAll('_',' ')}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{items.length}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{items.map(item=><Link key={item.kind+item.id} href={item.href} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50"><div className="font-bold text-slate-900">{item.label}</div>{item.description?<p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.description}</p>:null}<div className="mt-3 flex flex-wrap gap-2">{Object.entries(item.metadata??{}).filter(([,value])=>value!==null&&value!==undefined&&typeof value!=='object').slice(0,4).map(([key,value])=><span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{key.replaceAll('_',' ')}: {String(value)}</span>)}</div></Link>)}</div></section>)}
  </div>
}
