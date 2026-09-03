'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, DatabaseBackup, Gauge, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'

export type PlatformProject={id:string;name:string;description:string|null;organizationId:string;organizationRole:string}
type PlatformData={
  capacity:Record<string,unknown>|null
  recovery:Record<string,unknown>|null
  contractChecks:Array<Record<string,unknown>>
  drills:Array<Record<string,unknown>>
  jobs:Array<Record<string,unknown>>
  events:Array<Record<string,unknown>>
  telemetry:Array<Record<string,unknown>>
  sampling:Array<Record<string,unknown>>
}

function number(value:unknown,fallback:number){const n=Number(value);return Number.isFinite(n)?n:fallback}
function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{} }
function date(value:unknown){return typeof value==='string'&&value?new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'N/A'}

export function PlatformControls({projects}:{projects:PlatformProject[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [data,setData]=useState<PlatformData|null>(null)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [capacity,setCapacity]=useState({maxConcurrentJobs:4,maxJobsPerHour:120,maxProfileRows:10000,maxFileBytes:52428800,maxNotificationsPerHour:500})
  const [recovery,setRecovery]=useState({targetRpoMinutes:60,targetRtoMinutes:240,drillFrequencyDays:90,enabled:true})
  const [drill,setDrill]=useState({drillType:'RESTORE_REHEARSAL',status:'PASSED',measuredRpoMinutes:30,measuredRtoMinutes:120,environment:'production',notes:''})
  const project=projects.find(item=>item.id===projectId)
  const canAdmin=project?.organizationRole==='OWNER'||project?.organizationRole==='ADMIN'

  const load=useCallback(async()=>{
    if(!projectId)return
    setLoading(true);setError('')
    try{
      const response=await fetch(`/api/platform/${encodeURIComponent(projectId)}`,{cache:'no-store'})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to load platform controls.')
      setData(payload)
      const cap=record(payload.capacity)
      setCapacity({
        maxConcurrentJobs:number(cap.max_concurrent_jobs,4),maxJobsPerHour:number(cap.max_jobs_per_hour,120),maxProfileRows:number(cap.max_profile_rows,10000),
        maxFileBytes:number(cap.max_file_bytes,52428800),maxNotificationsPerHour:number(cap.max_notifications_per_hour,500),
      })
      const readiness=record(payload.recovery);const policy=record(readiness.policy)
      setRecovery({targetRpoMinutes:number(policy.target_rpo_minutes,60),targetRtoMinutes:number(policy.target_rto_minutes,240),drillFrequencyDays:number(policy.drill_frequency_days,90),enabled:policy.enabled!==false})
    }catch(e){setError(e instanceof Error?e.message:'Unable to load platform controls.')}finally{setLoading(false)}
  },[projectId])
  useEffect(()=>{void load()},[load])

  const summary=useMemo(()=>{
    const jobs=data?.jobs??[];const events=data?.events??[]
    return {
      running:jobs.filter(row=>row.status==='RUNNING').length,
      queued:jobs.filter(row=>row.status==='QUEUED').length,
      failed:jobs.filter(row=>row.status==='DEAD').length,
      pendingEvents:events.filter(row=>['PENDING','FAILED','PROCESSING'].includes(String(row.status))).length,
    }
  },[data])

  async function patch(section:string,payload:Record<string,unknown>,key:string){
    if(!projectId)return
    setBusy(key);setError('');setMessage('')
    try{
      const response=await fetch(`/api/platform/${encodeURIComponent(projectId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({section,...payload})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error??'Unable to update platform controls.')
      setMessage(`${section.toLowerCase()} controls updated.`);await load()
    }catch(e){setError(e instanceof Error?e.message:'Unable to update platform controls.')}finally{setBusy('')}
  }
  async function action(actionName:string,payload:Record<string,unknown>,key:string){
    if(!projectId)return
    setBusy(key);setError('');setMessage('')
    try{
      const response=await fetch(`/api/platform/${encodeURIComponent(projectId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:actionName,...payload})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error??'Unable to execute platform action.')
      setMessage(actionName==='RUN_CONTRACT_CHECK'?'Platform contract check completed.':'Recovery drill recorded and evaluated.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Unable to execute platform action.')}finally{setBusy('')}
  }
  async function saveCapacity(event:FormEvent){event.preventDefault();await patch('CAPACITY',capacity,'capacity')}
  async function saveRecovery(event:FormEvent){event.preventDefault();await patch('RECOVERY',recovery,'recovery')}
  async function recordDrill(event:FormEvent){event.preventDefault();await action('RECORD_RECOVERY_DRILL',drill,'drill')}

  const readiness=record(data?.recovery);const latestCheck=data?.contractChecks?.[0];const latestDrill=data?.drills?.[0]
  const readinessStatus=String(readiness.status??'UNKNOWN')
  const checkPassed=latestCheck?.status==='PASSED'

  if(!projects.length)return <div className="rounded-3xl border border-amber-200 bg-white p-7 text-sm text-amber-800 shadow-sm">No accessible project is available for platform controls.</div>

  return <div className="space-y-6">
    <section className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Control scope</p><h2 className="mt-1 text-2xl font-black">Project reliability boundary</h2><p className="mt-2 text-sm text-slate-500">Controls are enforced server-side and recorded in the governance audit trail.</p></div><div className="flex items-end gap-2"><label className="min-w-72 text-sm font-semibold">Project<select value={projectId} onChange={event=>setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{projects.map(item=><option key={item.id} value={item.id}>{item.name} · {item.organizationRole}</option>)}</select></label><button onClick={()=>void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Refresh</button></div></div></section>

    {message?<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>:null}
    {error?<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>:null}

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Running jobs" value={summary.running} detail="Claimed execution slots" icon={<Activity className="h-5 w-5"/>}/>
      <Metric label="Queued jobs" value={summary.queued} detail="Durable pending work" icon={<Gauge className="h-5 w-5"/>}/>
      <Metric label="Dead jobs" value={summary.failed} detail="Last hour" icon={<ShieldAlert className="h-5 w-5"/>}/>
      <Metric label="Pending events" value={summary.pendingEvents} detail="Outbox not yet completed" icon={<DatabaseBackup className="h-5 w-5"/>}/>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={event=>void saveCapacity(event)} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-blue-600"/><h3 className="text-lg font-black">Execution capacity</h3></div><p className="mt-1 text-sm text-slate-500">Hard limits are enforced by the durable queue, profiling sampler and notification dispatcher.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Concurrent jobs" value={capacity.maxConcurrentJobs} onChange={value=>setCapacity(current=>({...current,maxConcurrentJobs:value}))}/>
        <Field label="Jobs per hour" value={capacity.maxJobsPerHour} onChange={value=>setCapacity(current=>({...current,maxJobsPerHour:value}))}/>
        <Field label="Max profile rows" value={capacity.maxProfileRows} onChange={value=>setCapacity(current=>({...current,maxProfileRows:value}))}/>
        <Field label="Max file bytes" value={capacity.maxFileBytes} onChange={value=>setCapacity(current=>({...current,maxFileBytes:value}))}/>
        <Field label="Notifications per hour" value={capacity.maxNotificationsPerHour} onChange={value=>setCapacity(current=>({...current,maxNotificationsPerHour:value}))}/>
      </div><button disabled={!canAdmin||busy==='capacity'} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy==='capacity'?<Loader2 className="h-4 w-4 animate-spin"/>:null}Save capacity</button>{!canAdmin?<p className="mt-2 text-xs text-amber-700">Organization OWNER or ADMIN access is required to change platform capacity.</p>:null}</form>

      <form onSubmit={event=>void saveRecovery(event)} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><DatabaseBackup className="h-5 w-5 text-violet-600"/><h3 className="text-lg font-black">Recovery objectives</h3></div><span className={`rounded-full px-3 py-1 text-xs font-black ${readinessStatus==='READY'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-800'}`}>{readinessStatus}</span></div><p className="mt-1 text-sm text-slate-500">RPO and RTO targets are validated against recorded recovery drill evidence.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Target RPO minutes" value={recovery.targetRpoMinutes} onChange={value=>setRecovery(current=>({...current,targetRpoMinutes:value}))}/>
        <Field label="Target RTO minutes" value={recovery.targetRtoMinutes} onChange={value=>setRecovery(current=>({...current,targetRtoMinutes:value}))}/>
        <Field label="Drill frequency days" value={recovery.drillFrequencyDays} onChange={value=>setRecovery(current=>({...current,drillFrequencyDays:value}))}/>
        <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={recovery.enabled} onChange={event=>setRecovery(current=>({...current,enabled:event.target.checked}))}/>Enforce recovery policy</label>
      </div><button disabled={!canAdmin||busy==='recovery'} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy==='recovery'?<Loader2 className="h-4 w-4 animate-spin"/>:null}Save recovery policy</button></form>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black">Automated platform contract gate</h3><p className="mt-1 text-sm text-slate-500">Checks audit integrity, execution-source uniqueness, profiling evidence, contracts, stale runs and dead-letter health.</p></div><button type="button" disabled={!canAdmin||busy==='check'} onClick={()=>void action('RUN_CONTRACT_CHECK',{},'check')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy==='check'?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}Run gate now</button></div>
        {latestCheck?<div className={`mt-5 rounded-2xl border p-4 ${checkPassed?'border-emerald-200 bg-emerald-50':'border-red-200 bg-red-50'}`}><div className="flex items-center justify-between gap-3"><div className="font-black">{String(latestCheck.status)}</div><div className="text-xs font-bold">{number(latestCheck.failure_count,0)} failures</div></div><p className="mt-2 text-xs text-slate-600">Completed {date(latestCheck.completed_at)}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(record(latestCheck.checks)).map(([key,value])=>{const check=record(value);const passed=key==='audit_chain'?check.valid===true:check.passed===true;return <div key={key} className="rounded-xl bg-white/80 px-3 py-2 text-xs"><span className={passed?'text-emerald-700':'text-red-700'}>{passed?'PASS':'FAIL'}</span><span className="ml-2 font-semibold text-slate-700">{key.replaceAll('_',' ')}</span></div>})}</div></div>:<p className="mt-5 text-sm text-slate-500">No contract check has been recorded yet.</p>}
      </div>

      <form onSubmit={event=>void recordDrill(event)} className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-lg font-black">Record recovery drill evidence</h3><p className="mt-1 text-sm text-slate-500">A drill only satisfies the policy when the measured RPO and RTO meet the configured targets.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Drill type<select value={drill.drillType} onChange={event=>setDrill(current=>({...current,drillType:event.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>BACKUP_VERIFICATION</option><option>RESTORE_REHEARSAL</option><option>DISASTER_RECOVERY</option></select></label><label className="text-sm font-semibold">Outcome<select value={drill.status} onChange={event=>setDrill(current=>({...current,status:event.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>PASSED</option><option>FAILED</option></select></label><Field label="Measured RPO minutes" value={drill.measuredRpoMinutes} onChange={value=>setDrill(current=>({...current,measuredRpoMinutes:value}))}/><Field label="Measured RTO minutes" value={drill.measuredRtoMinutes} onChange={value=>setDrill(current=>({...current,measuredRtoMinutes:value}))}/></div><label className="mt-3 block text-sm font-semibold">Evidence notes<textarea value={drill.notes} onChange={event=>setDrill(current=>({...current,notes:event.target.value}))} className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2.5" placeholder="Restore test evidence, backup timestamp, verification details..."/></label><button disabled={!canAdmin||busy==='drill'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy==='drill'?<Loader2 className="h-4 w-4 animate-spin"/>:<DatabaseBackup className="h-4 w-4"/>}Record drill</button>{latestDrill?<p className="mt-3 text-xs text-slate-500">Latest: {String(latestDrill.drill_type)} · {String(latestDrill.policy_result)} · {date(latestDrill.completed_at)}</p>:null}</form>
    </section>

    <section className="rounded-3xl border bg-white p-6 shadow-sm"><h3 className="text-lg font-black">Sampling governance</h3><p className="mt-1 text-sm text-slate-500">Current dataset policies use deterministic seeds and are capped by the project profile-row and file-byte limits above.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Dataset</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Max rows</th><th className="px-3 py-2">Percent</th><th className="px-3 py-2">Seed</th></tr></thead><tbody>{(data?.sampling??[]).map(row=><tr key={String(row.dataset_id)} className="border-b border-slate-100"><td className="px-3 py-3 font-mono text-xs">{String(row.dataset_id)}</td><td className="px-3 py-3 font-bold">{String(row.mode)}</td><td className="px-3 py-3">{String(row.max_rows)}</td><td className="px-3 py-3">{String(row.sample_percent)}</td><td className="px-3 py-3">{String(row.deterministic_seed)}</td></tr>)}</tbody></table>{!(data?.sampling??[]).length?<p className="py-4 text-sm text-slate-500">No dataset-specific sampling override exists. The deterministic FIXED default is active.</p>:null}</div></section>
  </div>
}

function Field({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){return <label className="text-sm font-semibold">{label}<input type="number" value={value} onChange={event=>onChange(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>}
function Metric({label,value,detail,icon}:{label:string;value:number;detail:string;icon:React.ReactNode}){return <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">{icon}</span></div></div>}
