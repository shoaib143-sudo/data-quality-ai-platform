'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Check, GitBranch, Loader2, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react'

type Project={id:string;name:string}
type Source={id:string;name:string;source_type:string;status:string}
type SuggestionPayload={
  kind?:string;origin?:string;relationship?:string;direction?:string;authority?:string
  source?:{discovered_asset_id?:string;namespace?:string;asset?:string;column?:string;catalog_identity_key?:string}
  target?:{discovered_asset_id?:string;namespace?:string;asset?:string;column?:string;catalog_identity_key?:string}
}
type Suggestion={
  id:string;project_id:string;suggestion:SuggestionPayload;evidence:Record<string,unknown>;confidence:number|null;created_at:string
  review_status:string|null;review_note:string|null;reviewed_at:string|null;authority_effect:string|null
}
type Posture={valid?:boolean;state?:string;suggestions?:number;accepted_suggestions?:number;human_promoted_dependencies?:number;module_3_blocker_cleared?:boolean}

const label=(part:{namespace?:string;asset?:string;column?:string}|undefined)=>part?`${part.namespace?`${part.namespace}.`:''}${part.asset??'asset'}${part.column?`.${part.column}`:''}`:'Unknown field'

export function AiLineageSuggestions({projects}:{projects:Project[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [sourceId,setSourceId]=useState('')
  const [suggestions,setSuggestions]=useState<Suggestion[]>([])
  const [sources,setSources]=useState<Source[]>([])
  const [posture,setPosture]=useState<Posture|null>(null)
  const [notes,setNotes]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [message,setMessage]=useState<string|null>(null)

  const refresh=useCallback(async()=>{
    if(!projectId)return
    setLoading(true);setError(null)
    try{
      const response=await fetch(`/api/lineage/suggestions?projectId=${encodeURIComponent(projectId)}`,{cache:'no-store'})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Unable to load AI lineage suggestions')
      setSuggestions(body.suggestions??[]);setSources(body.sources??[]);setPosture(body.posture??null)
    }catch(err){setError(err instanceof Error?err.message:String(err))}finally{setLoading(false)}
  },[projectId])

  useEffect(()=>{void refresh()},[refresh])

  async function act(payload:Record<string,unknown>,success:string){
    setLoading(true);setError(null);setMessage(null)
    try{
      const response=await fetch('/api/lineage/suggestions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'AI lineage action failed')
      setMessage(success);await refresh()
    }catch(err){setError(err instanceof Error?err.message:String(err));setLoading(false)}
  }

  const pending=useMemo(()=>suggestions.filter(item=>!item.review_status),[suggestions])
  const accepted=useMemo(()=>suggestions.filter(item=>item.review_status==='ACCEPTED'),[suggestions])

  if(!projects.length)return null

  return <section className="mt-6 rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700"><Bot className="h-4 w-4"/>AI-assisted lineage suggestions</div>
        <h2 className="mt-2 text-xl font-black">Infer candidate dependencies from governed catalog metadata</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">The architect agent reads table and field metadata and proposes reviewable dependencies. Suggestions are metadata-derived hypotheses only. They do not populate source-observed lineage and do not clear the Module #3 Databricks blocker.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={projectId} onChange={event=>{setProjectId(event.target.value);setSourceId('')}} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <select value={sourceId} onChange={event=>setSourceId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><option value="">All active sources</option>{sources.map(source=><option key={source.id} value={source.id}>{source.name} · {source.source_type}</option>)}</select>
        <button disabled={loading} onClick={()=>void act({action:'generate',projectId,sourceId:sourceId||null,maxSuggestions:100},'Metadata inference completed.')} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}Generate suggestions</button>
        <button disabled={loading} onClick={()=>void refresh()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50" title="Refresh"><RefreshCw className="h-4 w-4"/></button>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <Metric label="Suggestions" value={posture?.suggestions??suggestions.length}/>
      <Metric label="Pending review" value={pending.length}/>
      <Metric label="Accepted" value={posture?.accepted_suggestions??accepted.length}/>
      <Metric label="Human promoted" value={posture?.human_promoted_dependencies??0}/>
    </div>

    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/><div><span className="font-black">Truth boundary:</span> AI suggestions have <code>SUGGESTION_ONLY</code> authority. Accepting a suggestion still makes no lineage mutation. A separate user with <code>lineage.manage</code> must promote it, and the resulting edge remains <code>HUMAN_CONFIRMED_AI_INFERRED</code>, never source-observed lineage.</div></div>
    {error?<p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>:null}
    {message?<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>:null}

    {suggestions.length?<div className="mt-5 space-y-3">{suggestions.slice(0,100).map(item=>{
      const source=item.suggestion?.source,target=item.suggestion?.target
      const status=item.review_status??'PENDING'
      return <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">AI INFERRED</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status==='ACCEPTED'?'bg-emerald-50 text-emerald-700':status==='REJECTED'?'bg-red-50 text-red-700':'bg-slate-100 text-slate-600'}`}>{status}</span><span className="text-xs font-bold text-slate-500">{item.confidence===null?'N/A':`${Math.round(Number(item.confidence)*100)}% confidence`}</span></div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] md:items-center"><FieldLabel value={label(source)}/><GitBranch className="mx-auto h-4 w-4 text-violet-500"/><FieldLabel value={label(target)}/></div>
            <p className="mt-2 text-xs text-slate-500">Suggested <span className="font-bold">referential dependency</span> · inference model <code>metadata-lineage-heuristics-v1</code> · observed lineage: <span className="font-black">false</span></p>
            {item.review_note?<p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-bold">Review:</span> {item.review_note}</p>:null}
          </div>
          <div className="w-full md:w-72">
            {!item.review_status?<><input value={notes[item.id]??''} onChange={event=>setNotes(current=>({...current,[item.id]:event.target.value}))} placeholder="Required human review note" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-300"/><div className="mt-2 flex gap-2"><button disabled={loading||!(notes[item.id]??'').trim()} onClick={()=>void act({action:'review',suggestionId:item.id,decision:'ACCEPTED',note:notes[item.id]},'Suggestion accepted. No lineage was mutated.')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Check className="h-3.5 w-3.5"/>Accept</button><button disabled={loading||!(notes[item.id]??'').trim()} onClick={()=>void act({action:'review',suggestionId:item.id,decision:'REJECTED',note:notes[item.id]},'Suggestion rejected.')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40"><X className="h-3.5 w-3.5"/>Reject</button></div></>:null}
            {item.review_status==='ACCEPTED'?<button disabled={loading} onClick={()=>void act({action:'promote',suggestionId:item.id},'Accepted suggestion promoted as a human-confirmed inferred dependency.')} className="w-full rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-40">Promote as human-confirmed dependency</button>:null}
          </div>
        </div>
      </article>
    })}</div>:<div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center"><Sparkles className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 font-black text-slate-700">No AI lineage suggestions yet</p><p className="mt-1 text-sm text-slate-500">Run metadata inference to create governed, reviewable candidates.</p></div>}
  </section>
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{value}</p></div>}
function FieldLabel({value}:{value:string}){return <div className="truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold text-slate-700" title={value}>{value}</div>}
