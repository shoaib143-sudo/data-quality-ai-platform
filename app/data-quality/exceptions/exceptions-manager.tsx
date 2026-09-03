'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, Loader2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

type ExceptionRow={id:string;quality_rule_run_id:string;rule_definition_id:string;dataset_version_id:string;profile_run_id:string|null;record_key:string|null;record_hash:string;column_name:string|null;observed_value:string|null;reason:string;sample:Record<string,unknown>;created_at:string;status:string;waiver_reason:string|null;approved_at:string|null;expires_at:string|null;resolution_notes:string|null;rule_name:string;dataset_name:string}

export function ExceptionsManager({exceptions}:{exceptions:ExceptionRow[]}){
  const router=useRouter()
  const [busy,setBusy]=useState<string|null>(null)
  const [message,setMessage]=useState('')
  const [filter,setFilter]=useState('OPEN')
  const visible=filter==='ALL'?exceptions:exceptions.filter(item=>item.status===filter)

  async function action(id:string,action:'WAIVE'|'RESOLVE'|'REJECT'|'REOPEN'){
    setBusy(id);setMessage('')
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
      const response=await fetch(`/api/data-quality/exceptions/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,reason,expiresAt,notes})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to update exception.')
      setMessage(`Exception ${action.toLowerCase()} action completed.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to update exception.')}finally{setBusy(null)}
  }

  const counts=Object.fromEntries(['OPEN','WAIVED','RESOLVED','REJECTED'].map(status=>[status,exceptions.filter(item=>item.status===status).length]))
  return <div className="mt-6 space-y-6">
    <section className="grid gap-3 sm:grid-cols-4">{(['OPEN','WAIVED','RESOLVED','REJECTED'] as const).map(status=><button key={status} onClick={()=>setFilter(status)} className={`rounded-2xl border p-4 text-left ${filter===status?'border-blue-300 bg-blue-50':'border-slate-200 bg-white'}`}><div className="text-2xl font-black">{counts[status]}</div><div className="text-xs font-bold text-slate-500">{status}</div></button>)}</section>
    <div className="flex items-center justify-between gap-3"><button onClick={()=>setFilter('ALL')} className="text-sm font-bold text-blue-600">Show all</button>{message?<p className="text-sm text-slate-600">{message}</p>:null}</div>
    <section className="space-y-3">{visible.length?visible.map(item=><article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status==='OPEN'?'bg-red-50 text-red-700':item.status==='WAIVED'?'bg-amber-50 text-amber-700':item.status==='RESOLVED'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{item.status}</span><span className="font-bold">{item.rule_name}</span></div><p className="mt-1 text-sm text-slate-500">{item.dataset_name} · {item.column_name??'Dataset'} · record {item.record_key??item.record_hash.slice(0,10)}</p><p className="mt-3 text-sm text-slate-700">{item.reason}</p>{item.observed_value?<p className="mt-1 text-xs font-mono text-slate-500">Observed: {item.observed_value}</p>:null}{item.waiver_reason?<div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900"><div className="font-bold">Approved waiver</div><div className="mt-1">{item.waiver_reason}</div><div className="mt-1">Expires {item.expires_at?new Date(item.expires_at).toLocaleString():'N/A'}</div></div>:null}{item.resolution_notes?<p className="mt-3 text-xs text-slate-500">{item.resolution_notes}</p>:null}<details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-blue-600">Redacted record sample</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(item.sample,null,2)}</pre></details></div><div className="flex shrink-0 flex-wrap gap-2">{item.status==='OPEN'?<><button disabled={busy===item.id} onClick={()=>void action(item.id,'WAIVE')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700"><Clock3 className="h-3.5 w-3.5"/>Waive</button><button disabled={busy===item.id} onClick={()=>void action(item.id,'RESOLVE')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5"/>Resolve</button><button disabled={busy===item.id} onClick={()=>void action(item.id,'REJECT')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><XCircle className="h-3.5 w-3.5"/>Reject</button></>:<button disabled={busy===item.id} onClick={()=>void action(item.id,'REOPEN')} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5"/>Reopen</button>}{busy===item.id?<Loader2 className="h-4 w-4 animate-spin text-blue-600"/>:null}</div></div></article>):<div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><ShieldCheck className="mx-auto mb-3 h-7 w-7 text-emerald-600"/>No quality exceptions match this status.</div>}</section>
  </div>
}
