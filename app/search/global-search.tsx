'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { ArrowRight, Loader2, Search, ShieldCheck, Sparkles, Tag } from 'lucide-react'

type Result={kind:string;id:string;projectId:string;label:string;description:string|null;href:string;score:number;metadata:Record<string,unknown>}
type SemanticStatus='ENABLED'|'NOT_CONFIGURED'|'UNAVAILABLE'|'SKIPPED'

const examples=[
  'critical customer data',
  'PII with open issues',
  'quality findings',
  'certified finance data',
]

function visibleMetadata(metadata:Record<string,unknown>){
  return Object.entries(metadata??{}).filter(([,value])=>value!==null&&value!==undefined&&typeof value!=='object').slice(0,4)
}

export function GlobalSearch(){
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<Result[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('Search across governed data, business meaning, quality, risk, policies and lineage.')
  const [semanticStatus,setSemanticStatus]=useState<SemanticStatus>('SKIPPED')

  async function search(event:FormEvent){
    event.preventDefault();if(query.trim().length<2)return
    setBusy(true);setMessage('')
    try{
      const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{cache:'no-store'})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Search failed.')
      const status=(payload.semantic?.status??'SKIPPED') as SemanticStatus
      setResults(payload.results??[])
      setSemanticStatus(status)
      const suffix=status==='ENABLED'?' Semantic ranking is active.':status==='NOT_CONFIGURED'?' Using lexical search until semantic ranking is configured.':status==='UNAVAILABLE'?' Semantic ranking is temporarily unavailable; lexical results are shown.':''
      setMessage(`${payload.count??0} governed results found.${suffix}`)
    }catch(error){setSemanticStatus('SKIPPED');setMessage(error instanceof Error?error.message:'Search failed.')}finally{setBusy(false)}
  }

  const grouped=results.reduce<Record<string,Result[]>>((groups,result)=>{(groups[result.kind]??=[]).push(result);return groups},{})
  return <div className="mt-6 space-y-6">
    <form onSubmit={search} className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm" aria-label="Search DataNexus">
      <label className="relative block">
        <span className="sr-only">Search governed data and governance evidence</span>
        <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400" aria-hidden="true"/>
        <input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ask or search: customer data, PII, quality issue, contract…" className="w-full rounded-2xl border border-slate-200 py-3.5 pl-12 pr-32 text-base outline-none focus:border-blue-300"/>
        <button disabled={busy||query.trim().length<2} className="absolute right-2 top-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"/>:<Search className="h-4 w-4"/>}Search</button>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="mr-1 text-xs font-bold uppercase tracking-wide text-slate-400">Try</p>
        {examples.map(example=><button key={example} type="button" onClick={()=>setQuery(example)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{example}</button>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-sm text-slate-500" role="status" aria-live="polite">{message}</p>{semanticStatus==='ENABLED'?<span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700"><Sparkles className="h-3 w-3"/>Hybrid semantic</span>:null}</div>
    </form>

    {!busy&&query.trim().length>=2&&results.length===0&&message.startsWith('0 governed')?<section className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center"><Search className="mx-auto h-6 w-6 text-slate-400"/><h2 className="mt-3 font-black text-slate-900">No governed match yet</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Try a business term, dataset, owner, issue, classification, quality concept or policy. DataNexus will not fabricate a match.</p></section>:null}

    {Object.entries(grouped).map(([kind,items])=><section key={kind} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tag className="h-4 w-4 text-violet-600"/><h2 className="font-bold capitalize">{kind.replaceAll('_',' ').toLowerCase()}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{items.length}</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map(item=>{
        const metadata=visibleMetadata(item.metadata)
        return <Link key={item.kind+item.id} href={item.href} className="group rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          <div className="flex items-start justify-between gap-3"><div><div className="font-bold text-slate-900">{item.label}</div>{item.description?<p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.description}</p>:null}</div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600"/></div>
          {metadata.length?<div className="mt-3 flex flex-wrap gap-2">{metadata.map(([key,value])=><span key={key} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">{key.replaceAll('_',' ')}: {String(value)}</span>)}</div>:null}
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600"/><span>Governed result</span>{Number.isFinite(item.score)?<span>· relevance {Math.max(0,Math.min(100,Math.round(item.score*100)))}%</span>:null}</div>
        </Link>
      })}</div>
    </section>)}
  </div>
}
