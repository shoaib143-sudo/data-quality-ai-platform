'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, CheckCircle2, DatabaseBackup, Gauge, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'

export type PlatformProject = {
  id: string
  name: string
  description: string | null
  organizationId: string
  organizationRole: string
  canManageCapacity: boolean
  canAdminPlatform: boolean
}

type PlatformData = {
  capacity: Record<string, unknown> | null
  recovery: Record<string, unknown> | null
  governanceActivation: Record<string, unknown> | null
  contractChecks: Array<Record<string, unknown>>
  drills: Array<Record<string, unknown>>
  jobs: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  sampling: Array<Record<string, unknown>>
}

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.22)]'
const input='rounded-xl border border-white/10 bg-[#07182a] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/40'
function number(value: unknown, fallback: number) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:fallback }
function record(value: unknown) { return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{} }
function when(value: unknown) { return typeof value==='string'&&value?new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'N/A' }

export function PlatformControlsV2({projects}:{projects:PlatformProject[]}) {
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [data,setData]=useState<PlatformData|null>(null)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [capacity,setCapacity]=useState({maxConcurrentJobs:4,maxJobsPerHour:120,maxProfileRows:10000,maxFileBytes:52428800,maxNotificationsPerHour:500})
  const [recovery,setRecovery]=useState({targetRpoMinutes:60,targetRtoMinutes:240,drillFrequencyDays:90,enabled:true})
  const [drill,setDrill]=useState({drillType:'RESTORE_REHEARSAL',status:'PASSED',measuredRpoMinutes:30,measuredRtoMinutes:120,environment:'production',notes:''})
  const project=projects.find(item=>item.id===projectId)

  const load=useCallback(async()=>{
    if(!projectId)return
    setLoading(true);setError('')
    try{
      const response=await fetch(`/api/platform/${encodeURIComponent(projectId)}`,{cache:'no-store'})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to load platform controls.')
      setData(payload)
      const cap=record(payload.capacity)
      setCapacity({maxConcurrentJobs:number(cap.max_concurrent_jobs,4),maxJobsPerHour:number(cap.max_jobs_per_hour,120),maxProfileRows:number(cap.max_profile_rows,10000),maxFileBytes:number(cap.max_file_bytes,52428800),maxNotificationsPerHour:number(cap.max_notifications_per_hour,500)})
      const readiness=record(payload.recovery);const policy=record(readiness.policy)
      setRecovery({targetRpoMinutes:number(policy.target_rpo_minutes,60),targetRtoMinutes:number(policy.target_rto_minutes,240),drillFrequencyDays:number(policy.drill_frequency_days,90),enabled:policy.enabled!==false})
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to load platform controls.')}finally{setLoading(false)}
  },[projectId])
  useEffect(()=>{void load()},[load])

  const summary=useMemo(()=>({
    running:(data?.jobs??[]).filter(row=>row.status==='RUNNING').length,
    queued:(data?.jobs??[]).filter(row=>row.status==='QUEUED').length,
    failed:(data?.jobs??[]).filter(row=>row.status==='DEAD').length,
    pending:(data?.events??[]).filter(row=>['PENDING','FAILED','PROCESSING'].includes(String(row.status))).length,
  }),[data])

  async function request(method:'PATCH'|'POST', body:Record<string,unknown>, key:string, success:string){
    if(!projectId)return
    setBusy(key);setMessage('');setError('')
    try{
      const response=await fetch(`/api/platform/${encodeURIComponent(projectId)}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Platform action failed.')
      setMessage(success);await load()
    }catch(cause){setError(cause instanceof Error?cause.message:'Platform action failed.')}finally{setBusy('')}
  }
  async function saveCapacity(event:FormEvent){event.preventDefault();if(!project?.canManageCapacity)return;await request('PATCH',{section:'CAPACITY',...capacity},'capacity','Capacity controls updated.')}
  async function saveRecovery(event:FormEvent){event.preventDefault();if(!project?.canAdminPlatform)return;await request('PATCH',{section:'RECOVERY',...recovery},'recovery','Recovery policy updated.')}
  async function runGate(){if(!project?.canAdminPlatform)return;await request('POST',{action:'RUN_CONTRACT_CHECK'},'gate','Platform contract check completed.')}
  async function recordDrill(event:FormEvent){event.preventDefault();if(!project?.canAdminPlatform)return;await request('POST',{action:'RECORD_RECOVERY_DRILL',...drill},'drill','Recovery drill recorded.')}

  if(!projects.length)return <div className={`${surface} p-6 text-sm text-slate-400`}>No accessible project is available.</div>
  const latestCheck=data?.contractChecks?.[0]
  const latestDrill=data?.drills?.[0]
  const readiness=record(data?.recovery)
  const governanceActivation=record(data?.governanceActivation)
  const governanceCoverage=record(governanceActivation.coverage)
  const governancePending=record(governanceActivation.pending)
  const governanceBlockers=record(governanceActivation.blockers)
  const governanceState=String(governanceActivation.state??'UNKNOWN')
  const governanceStateLabel=governanceState.replaceAll('_',' ')

  return <div className="space-y-5">
    <section className={`${surface} flex flex-wrap items-end justify-between gap-4 p-5`}><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Control scope</p><h2 className="mt-1 text-xl font-black text-white">Project reliability boundary</h2><p className="mt-1 text-sm text-slate-500">Read access and each mutation use the same live capability contract as the API.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold text-slate-400">Project<select value={projectId} onChange={event=>setProjectId(event.target.value)} className={`mt-1 block min-w-64 ${input}`}>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-slate-200 hover:bg-white/[.05] disabled:opacity-50">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Refresh</button></div></section>
    {message?<p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-300">{message}</p>:null}{error?<p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-300">{error}</p>:null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Activity className="h-5 w-5"/>} label="Running jobs" value={summary.running} href="/monitoring"/><Metric icon={<Gauge className="h-5 w-5"/>} label="Queued jobs" value={summary.queued} href="/monitoring"/><Metric icon={<ShieldAlert className="h-5 w-5"/>} label="Dead jobs" value={summary.failed} href="/monitoring"/><Metric icon={<DatabaseBackup className="h-5 w-5"/>} label="Pending events" value={summary.pending} href="/monitoring"/></section>

    <section className={`${surface} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Governance activation</p>
          <h3 className="mt-1 font-black text-white">Effective project governance coverage</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Read-only deterministic evidence. Proposed, suggested, draft, and provisional records are shown separately and never counted as effective governance.</p>
        </div>
        <span className="rounded-lg bg-cyan-400/10 px-2.5 py-1.5 text-[10px] font-black text-cyan-200">{governanceStateLabel}</span>
      </div>
      {governanceActivation.project_id ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GovernanceMetric label="Active datasets" value={number(governanceActivation.active_datasets,0)}/>
        <GovernanceMetric label="Fully core-governed" value={number(governanceActivation.fully_core_governed,0)}/>
        <GovernanceMetric label="Stewardship" value={number(governanceCoverage.stewardship,0)}/>
        <GovernanceMetric label="Authoritative classification" value={number(governanceCoverage.authoritative_classification,0)}/>
        <GovernanceMetric label="Approved glossary" value={number(governanceCoverage.approved_glossary_mapping,0)}/>
        <GovernanceMetric label="Approved CDE" value={number(governanceCoverage.approved_cde_mapping,0)}/>
        <GovernanceMetric label="Active contracts" value={number(governanceCoverage.active_contract,0)}/>
        <GovernanceMetric label="Active certifications" value={number(governanceCoverage.active_certification,0)}/>
      </div> : <p className="mt-4 text-sm text-slate-500">Governance activation evidence is unavailable for this project.</p>}
      {Object.keys(governanceBlockers).length ? <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
        <p className="text-xs font-black uppercase tracking-[.12em] text-amber-300">Current blockers</p>
        <ul className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
          {Object.keys(governanceBlockers).map(code=><li key={code}>{governanceBlockerLabel(code)}</li>)}
        </ul>
      </div> : null}
      {Object.values(governancePending).some(value=>number(value,0)>0) ? <div className="mt-4">
        <p className="text-xs font-black uppercase tracking-[.12em] text-slate-400">Pending, non-effective records</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(governancePending).filter(([,value])=>number(value,0)>0).map(([key,value])=><div key={key} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2 text-xs text-slate-400"><span className="font-bold text-slate-200">{number(value,0)}</span> {pendingLabel(key)}</div>)}
        </div>
      </div> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={saveCapacity} className={`${surface} p-5`}><div className="flex items-center justify-between"><h3 className="font-black text-white">Execution capacity</h3><span className={`rounded-lg px-2 py-1 text-[10px] font-black ${project?.canManageCapacity?'bg-emerald-400/10 text-emerald-300':'bg-slate-400/10 text-slate-500'}`}>{project?.canManageCapacity?'MANAGE':'READ ONLY'}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Concurrent jobs" value={capacity.maxConcurrentJobs} disabled={!project?.canManageCapacity} onChange={value=>setCapacity(current=>({...current,maxConcurrentJobs:value}))}/><Field label="Jobs per hour" value={capacity.maxJobsPerHour} disabled={!project?.canManageCapacity} onChange={value=>setCapacity(current=>({...current,maxJobsPerHour:value}))}/><Field label="Max profile rows" value={capacity.maxProfileRows} disabled={!project?.canManageCapacity} onChange={value=>setCapacity(current=>({...current,maxProfileRows:value}))}/><Field label="Max file bytes" value={capacity.maxFileBytes} disabled={!project?.canManageCapacity} onChange={value=>setCapacity(current=>({...current,maxFileBytes:value}))}/><Field label="Notifications/hour" value={capacity.maxNotificationsPerHour} disabled={!project?.canManageCapacity} onChange={value=>setCapacity(current=>({...current,maxNotificationsPerHour:value}))}/></div>{project?.canManageCapacity?<button disabled={busy==='capacity'} className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy==='capacity'?'Saving…':'Save capacity'}</button>:<p className="mt-4 text-xs text-slate-500">`capacity.manage` is required to change these limits.</p>}</form>

      <form onSubmit={saveRecovery} className={`${surface} p-5`}><div className="flex items-center justify-between"><h3 className="font-black text-white">Recovery objectives</h3><span className="rounded-lg bg-violet-400/10 px-2 py-1 text-[10px] font-black text-violet-300">{String(readiness.status??'UNKNOWN')}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Target RPO minutes" value={recovery.targetRpoMinutes} disabled={!project?.canAdminPlatform} onChange={value=>setRecovery(current=>({...current,targetRpoMinutes:value}))}/><Field label="Target RTO minutes" value={recovery.targetRtoMinutes} disabled={!project?.canAdminPlatform} onChange={value=>setRecovery(current=>({...current,targetRtoMinutes:value}))}/><Field label="Drill frequency days" value={recovery.drillFrequencyDays} disabled={!project?.canAdminPlatform} onChange={value=>setRecovery(current=>({...current,drillFrequencyDays:value}))}/></div>{project?.canAdminPlatform?<button disabled={busy==='recovery'} className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy==='recovery'?'Saving…':'Save recovery policy'}</button>:<p className="mt-4 text-xs text-slate-500">`admin.manage` is required to change recovery policy.</p>}</form>
    </section>

    <section className="grid gap-5 xl:grid-cols-2"><article className={`${surface} p-5`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-white">Platform contract gate</h3><p className="mt-1 text-xs text-slate-500">Audit, execution, profiling, contract and dead-letter checks.</p></div>{project?.canAdminPlatform?<button type="button" onClick={()=>void runGate()} disabled={busy==='gate'} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Run gate</button>:null}</div>{latestCheck?<Link href="/audit" className="mt-4 block rounded-xl border border-white/10 bg-[#08182b] p-4 hover:border-cyan-400/30"><p className="font-black text-slate-200">{String(latestCheck.status)}</p><p className="mt-1 text-xs text-slate-500">{String(latestCheck.failure_count??0)} failures · {when(latestCheck.completed_at)}</p></Link>:<p className="mt-4 text-sm text-slate-500">No contract check recorded yet.</p>}</article>
      <form onSubmit={recordDrill} className={`${surface} p-5`}><h3 className="font-black text-white">Recovery drill evidence</h3>{project?.canAdminPlatform?<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-400">Type<select value={drill.drillType} onChange={e=>setDrill(current=>({...current,drillType:e.target.value}))} className={`mt-1 w-full ${input}`}><option>BACKUP_VERIFICATION</option><option>RESTORE_REHEARSAL</option><option>DISASTER_RECOVERY</option></select></label><label className="text-xs font-bold text-slate-400">Outcome<select value={drill.status} onChange={e=>setDrill(current=>({...current,status:e.target.value}))} className={`mt-1 w-full ${input}`}><option>PASSED</option><option>FAILED</option></select></label><Field label="Measured RPO" value={drill.measuredRpoMinutes} onChange={value=>setDrill(current=>({...current,measuredRpoMinutes:value}))}/><Field label="Measured RTO" value={drill.measuredRtoMinutes} onChange={value=>setDrill(current=>({...current,measuredRtoMinutes:value}))}/><label className="sm:col-span-2 text-xs font-bold text-slate-400">Evidence notes<textarea value={drill.notes} onChange={e=>setDrill(current=>({...current,notes:e.target.value}))} className={`mt-1 min-h-20 w-full ${input}`}/></label><button disabled={busy==='drill'} className="sm:col-span-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{busy==='drill'?'Recording…':'Record drill'}</button></div>:<p className="mt-4 text-xs text-slate-500">Read-only. `admin.manage` is required to record drill evidence.</p>}{latestDrill?<p className="mt-3 text-xs text-slate-500">Latest: {String(latestDrill.drill_type)} · {String(latestDrill.policy_result)} · {when(latestDrill.completed_at)}</p>:null}</form></section>
  </div>
}

function Field({label,value,onChange,disabled=false}:{label:string;value:number;onChange:(value:number)=>void;disabled?:boolean}){return <label className="text-xs font-bold text-slate-400">{label}<input type="number" value={value} disabled={disabled} onChange={event=>onChange(Number(event.target.value))} className={`mt-1 w-full ${input} disabled:cursor-not-allowed disabled:opacity-45`}/></label>}
function Metric({label,value,icon,href}:{label:string;value:number;icon:React.ReactNode;href:string}){return <Link href={href} className={`${surface} block p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/30`}><span className="text-cyan-300">{icon}</span><p className="mt-3 text-2xl font-black text-white">{value}</p><p className="mt-1 text-xs font-bold text-slate-400">{label}</p></Link>}

function GovernanceMetric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-white/10 bg-[#08182b] p-3"><p className="text-xl font-black text-white">{value}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p></div>}

function governanceBlockerLabel(code:string){const labels:Record<string,string>={NO_ACTIVE_DATASETS:'No active datasets are available for governance activation.',INCOMPLETE_STEWARDSHIP_COVERAGE:'Active datasets do not all have effective stewardship coverage.',INCOMPLETE_AUTHORITATIVE_CLASSIFICATION_COVERAGE:'Active datasets do not all have authoritative classification coverage.',INCOMPLETE_APPROVED_GLOSSARY_COVERAGE:'Active datasets do not all have approved glossary mappings.',INCOMPLETE_APPROVED_CDE_COVERAGE:'Active datasets do not all have approved CDE mappings.',INCOMPLETE_ACTIVE_CONTRACT_COVERAGE:'Active datasets do not all have active data contracts.',INCOMPLETE_ACTIVE_CERTIFICATION_COVERAGE:'Active datasets do not all have current certifications.'};return labels[code]??'A governance activation requirement is not yet satisfied.'}
function pendingLabel(key:string){const labels:Record<string,string>={proposed_stewardship:'proposed stewardship assignments',proposed_classifications:'proposed classifications',proposed_glossary_mappings:'proposed glossary mappings',suggested_cde_mappings:'suggested CDE mappings',draft_contracts:'draft contracts',provisional_certifications:'provisional certifications'};return labels[key]??'pending governance records'}
