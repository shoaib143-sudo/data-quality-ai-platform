'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Loader2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

type ExceptionRow={id:string;project_id:string;quality_rule_run_id:string;rule_definition_id:string;dataset_version_id:string;profile_run_id:string|null;record_key:string|null;record_hash:string;column_name:string|null;observed_value:string|null;reason:string;sample:Record<string,unknown>;created_at:string;status:string;waiver_reason:string|null;approved_at:string|null;expires_at:string|null;resolution_notes:string|null;rule_name:string;dataset_name:string}

const surface='rounded-3xl border border-white/10 bg-[#0a1d33]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'

export function ExceptionsManager({exceptions,approvableProjectIds}:{exceptions:ExceptionRow[];approvableProjectIds:string[]}){
  const router=useRouter()
  const approvable=useMemo(()=>new Set(approvableProjectIds),[approvableProjectIds])
  const [busy,setBusy]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  const [filter,setFilter]=useState('OPEN')
  const visible=filter==='ALL'?exceptions:exceptions.filter(item=>item.status===filter)

  async function action(item:ExceptionRow,action:'WAIVE'|'RESOLVE'|'REJECT'|'REOPEN'){
    if(!approvable.has(item.project_id)){setMessage('You do not have exception approval authority for this project.');return}
    setBusy(item.id);setMessage('')
    try{
      let reason='',expiresAt='',notes=''
      if(action==='WAIVE'){
        reason=window.prompt('Business reason for temporary waiver:')?.trim()??''
        if(!reason)return
        const days=Number(window.prompt('Waiver duration in days:','7')??0)
        if(!Number.isFinite(days)||days<=0)throw new Error('Waiver duration must be a positive number of days.')
        expiresAt=new Date(Date.now()+days*86_400_000).toISOString()
      }else{
        notes=window.prompt(action==='RESOLVE'?'Resolution evidence / notes:':action==='REJECT'?'Reason for rejection:':'Reason for reopening:')?.trim()??''
      }
      const response=await fetch(`/api/data-quality/exceptions/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,reason,expiresAt,notes})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to update exception.')
      setMessage(`Exception ${action.toLowerCase()} action completed.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to update exception.')}finally{setBusy(null)}
  }

  const counts=Object.fromEntries(['OPEN','WAIVED','RESOLVED','REJECTED'].map(status=>[status,exceptions.filter(item=>item.status===status).length]))
  return <div className="mt-6 space-y-6">
    <section className="grid gap-3 sm:grid-cols-4">{(['OPEN','WAIVED','RESOLVED','REJECTED'] as const).map(status=><button key={status} onClick={()=>setFilter(status)} className={`${surface} p-4 text-left transition hover:border-cyan-400/30 ${filter===status?'ring-1 ring-cyan-400/50':''}`}><div className="text-2xl font-black text-white">{counts[status]}</div><div className="text-xs font-bold text-slate-500">{status}</div></button>)}</section>
    <div className="flex items-center justify-between gap-3"><button onClick={()=>setFilter('ALL')} className="text-sm font-bold text-blue-300 hover:text-cyan-300">Show all</button>{message?<p className="text-sm text-slate-400">{message}</p>:null}</div>
    <section className="space-y-3">{visible.length?visible.map(item=>{const canApprove=approvable.has(item.project_id);return <article key={item.id} className={`${surface} p-5 shadow-sm`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status==='OPEN'?'bg-rose-400/10 text-rose-300':item.status==='WAIVED'?'bg-amber-400/10 text-amber-300':item.status==='RESOLVED'?'bg-emerald-400/10 text-emerald-300':'bg-white/[0.05] text-slate-400'}`}>{item.status}</span><span className="font-bold text-slate-200">{item.rule_name}</span>{!canApprove?<span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">Read only</span>:null}</div><p className="mt-1 text-sm text-slate-500">{item.dataset_name} · {item.column_name??'Dataset'} · record {item.record_key??item.record_hash.slice(0,10)}</p><p className="mt-3 text-sm text-slate-300">{item.reason}</p>{item.observed_value?<p className="mt-1 text-xs font-mono text-slate-500">Observed: {item.observed_value}</p>:null}{item.waiver_reason?<div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200"><div className="font-bold">Approved waiver</div><div className="mt-1">{item.waiver_reason}</div><div className="mt-1">Expires {item.expires_at?new Date(item.expires_at).toLocaleString():'N/A'}</div></div>:null}{item.resolution_notes?<p className="mt-3 text-xs text-slate-500">{item.resolution_notes}</p>:null}<details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-blue-300">Redacted record sample</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-[#061426] p-3 text-xs text-slate-200">{JSON.stringify(item.sample,null,2)}</pre></details></div>{canApprove?<div className="flex shrink-0 flex-wrap gap-2">{item.status==='OPEN'?<><button disabled={busy===item.id} onClick={()=>void action(item,'WAIVE')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 px-3 py-2 text-xs font-bold text-amber-300"><Clock3 className="h-3.5 w-3.5"/>Waive</button><button disabled={busy===item.id} onClick={()=>void action(item,'RESOLVE')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5"/>Resolve</button><button disabled={busy===item.id} onClick={()=>void action(item,'REJECT')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-bold text-rose-300"><XCircle className="h-3.5 w-3.5"/>Reject</button></>:<button disabled={busy===item.id} onClick={()=>void action(item,'REOPEN')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><RotateCcw className="h-3.5 w-3.5"/>Reopen</button>}{busy===item.id?<Loader2 className="h-4 w-4 animate-spin text-blue-300"/>:null}</div>:null}</div></article>}):<div className={`${surface} border-dashed p-10 text-center text-sm text-slate-500`}><ShieldCheck className="mx-auto mb-3 h-7 w-7 text-emerald-300"/>No quality exceptions match this status.</div>}</section>
  </div>
}
