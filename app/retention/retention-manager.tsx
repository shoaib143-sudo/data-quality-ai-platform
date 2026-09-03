'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, DatabaseBackup, Loader2, LockKeyhole, PlayCircle, Save, ShieldAlert } from 'lucide-react'

export type RetentionProject={
  id:string
  name:string
  profileHistoryDays:number
  agentJobHistoryDays:number
  minimumProfileRuns:number
  minimumAgentRuns:number
  enabled:boolean
  legalHold:boolean
  lastExecutedAt:string|null
  lastResult:Record<string,unknown>
  archivedProfiles:number
  archivedJobs:number
}

export function RetentionManager({projects}:{projects:RetentionProject[]}) {
  const router=useRouter()
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const selected=useMemo(()=>projects.find((project)=>project.id===projectId),[projects,projectId])
  const [profileDays,setProfileDays]=useState(selected?.profileHistoryDays??365)
  const [jobDays,setJobDays]=useState(selected?.agentJobHistoryDays??180)
  const [minimumProfiles,setMinimumProfiles]=useState(selected?.minimumProfileRuns??5)
  const [minimumJobs,setMinimumJobs]=useState(selected?.minimumAgentRuns??50)
  const [enabled,setEnabled]=useState(selected?.enabled??false)
  const [legalHold,setLegalHold]=useState(selected?.legalHold??false)
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')

  function changeProject(id:string){
    setProjectId(id)
    const item=projects.find((project)=>project.id===id)
    setProfileDays(item?.profileHistoryDays??365);setJobDays(item?.agentJobHistoryDays??180);setMinimumProfiles(item?.minimumProfileRuns??5);setMinimumJobs(item?.minimumAgentRuns??50);setEnabled(item?.enabled??false);setLegalHold(item?.legalHold??false);setMessage('');setError('')
  }

  async function save(event:FormEvent){
    event.preventDefault();if(!projectId)return
    setBusy('save');setMessage('');setError('')
    try{
      const response=await fetch(`/api/retention/${projectId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileHistoryDays:profileDays,agentJobHistoryDays:jobDays,minimumProfileRuns:minimumProfiles,minimumAgentRuns:minimumJobs,enabled,legalHold})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to save retention policy.')
      setMessage('Retention policy saved.')
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'Unable to save retention policy.')}finally{setBusy('')}
  }

  async function runNow(){
    if(!projectId||!window.confirm('Run retention cleanup now? Eligible history is archived to a compact governance summary before deletion.'))return
    setBusy('run');setMessage('');setError('')
    try{
      const response=await fetch(`/api/retention/${projectId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'RUN_NOW',confirm:true})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Retention cleanup failed.')
      setMessage(`Cleanup completed. Archived/deleted profile runs: ${payload.result?.profile_runs_deleted??0}; agent runs: ${payload.result?.agent_runs_deleted??0}.`)
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'Retention cleanup failed.')}finally{setBusy('')}
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Evidence lifecycle</p><h2 className="mt-1 text-2xl font-black">Retention and archival</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Terminal profiling and job history can be compacted after the configured period. The latest evidence is always retained to protect trend baselines and auditability.</p></div><label className="min-w-72 text-sm font-semibold">Project<select value={projectId} onChange={(event)=>changeProject(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>
    </section>

    {selected?<section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-5"><Archive className="h-5 w-5 text-blue-700"/><p className="mt-3 text-3xl font-black text-blue-800">{selected.archivedProfiles}</p><p className="text-xs font-semibold text-blue-700">Archived profile summaries</p></div><div className="rounded-2xl border border-violet-100 bg-violet-50 p-5"><DatabaseBackup className="h-5 w-5 text-violet-700"/><p className="mt-3 text-3xl font-black text-violet-800">{selected.archivedJobs}</p><p className="text-xs font-semibold text-violet-700">Archived job summaries</p></div><div className={`rounded-2xl border p-5 ${selected.legalHold?'border-amber-200 bg-amber-50':'border-emerald-100 bg-emerald-50'}`}><LockKeyhole className={`h-5 w-5 ${selected.legalHold?'text-amber-700':'text-emerald-700'}`}/><p className="mt-3 text-lg font-black">{selected.legalHold?'LEGAL HOLD':'NORMAL RETENTION'}</p><p className="text-xs text-slate-600">Last execution: {selected.lastExecutedAt?new Date(selected.lastExecutedAt).toLocaleString():'Never'}</p></div></section>:null}

    <form onSubmit={(event)=>void save(event)} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="text-sm font-semibold">Profile history days<input type="number" min={30} value={profileDays} onChange={(event)=>setProfileDays(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/><span className="mt-1 block text-xs font-normal text-slate-400">Minimum 30 days. Older terminal runs become eligible after the baseline reserve.</span></label>
        <label className="text-sm font-semibold">Job history days<input type="number" min={30} value={jobDays} onChange={(event)=>setJobDays(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/><span className="mt-1 block text-xs font-normal text-slate-400">Agent steps and logs cascade with archived terminal jobs.</span></label>
        <label className="text-sm font-semibold">Minimum profile runs retained per dataset<input type="number" min={2} max={100} value={minimumProfiles} onChange={(event)=>setMinimumProfiles(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
        <label className="text-sm font-semibold">Minimum recent jobs retained per project<input type="number" min={10} max={1000} value={minimumJobs} onChange={(event)=>setMinimumJobs(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4"><input type="checkbox" checked={enabled} onChange={(event)=>setEnabled(event.target.checked)} className="mt-1"/><span><span className="block font-bold">Enable scheduled retention</span><span className="text-xs leading-5 text-slate-500">Daily worker evaluates only terminal history older than the configured threshold.</span></span></label><label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" checked={legalHold} onChange={(event)=>setLegalHold(event.target.checked)} className="mt-1"/><span><span className="block font-bold text-amber-900">Legal hold</span><span className="text-xs leading-5 text-amber-800">Blocks all retention deletion for the project, even when retention is enabled.</span></span></label></div>
      <div className="mt-6 flex flex-wrap items-center gap-3"><button disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save policy</button><button type="button" onClick={()=>void runNow()} disabled={Boolean(busy)||!enabled||legalHold} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{busy==='run'?<Loader2 className="h-4 w-4 animate-spin"/>:<PlayCircle className="h-4 w-4"/>}Run cleanup now</button>{legalHold?<span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700"><ShieldAlert className="h-4 w-4"/>Cleanup blocked by legal hold</span>:null}</div>
      {message?<p className="mt-4 text-sm font-medium text-emerald-700">{message}</p>:null}{error?<p className="mt-4 text-sm font-medium text-red-600">{error}</p>:null}
    </form>
  </div>
}
