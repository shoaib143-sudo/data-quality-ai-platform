'use client'
import { FormEvent, useMemo, useState } from 'react'
import { Loader2, Pause, Play, Plus, Trash2 } from 'lucide-react'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}
type Version={id:string;dataset_id:string;version_number:number;status:string}
type Schedule={id:string;project_id:string;dataset_version_id:string;job_type:string;name:string;enabled:boolean;cadence:string;interval_minutes:number|null;run_hour:number|null;run_minute:number|null;day_of_week:number|null;next_run_at:string;misfire_policy:string;retry_policy:Record<string,unknown>;last_enqueued_at:string|null}

export function ScheduleManager({projects,datasets,versions,initialSchedules}:{projects:Project[];datasets:Dataset[];versions:Version[];initialSchedules:Schedule[]}){
  const [schedules,setSchedules]=useState(initialSchedules)
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [datasetVersionId,setDatasetVersionId]=useState('')
  const [jobType,setJobType]=useState('PROFILING')
  const [cadence,setCadence]=useState('DAILY')
  const [name,setName]=useState('Daily governance run')
  const [runHour,setRunHour]=useState('1')
  const [runMinute,setRunMinute]=useState('0')
  const [intervalMinutes,setIntervalMinutes]=useState('60')
  const [dayOfWeek,setDayOfWeek]=useState('1')
  const [misfirePolicy,setMisfirePolicy]=useState('RUN_ONCE')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const datasetById=useMemo(()=>new Map(datasets.map(d=>[d.id,d])),[datasets])
  const eligibleVersions=versions.filter(v=>datasetById.get(v.dataset_id)?.project_id===projectId)
  const versionLabels=useMemo(()=>new Map(versions.map(v=>[v.id,`${datasetById.get(v.dataset_id)?.name??'Dataset'} v${v.version_number}`])),[versions,datasetById])

  async function refresh(){
    const response=await fetch('/api/schedules')
    const payload=await response.json()
    if(response.ok) setSchedules(payload.schedules??[])
  }
  async function create(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage('')
    try{
      const version=datasetVersionId||eligibleVersions[0]?.id
      if(!version) throw new Error('Select an available dataset version.')
      const response=await fetch('/api/schedules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,datasetVersionId:version,jobType,name,cadence,runHour:Number(runHour),runMinute:Number(runMinute),intervalMinutes:Number(intervalMinutes),dayOfWeek:Number(dayOfWeek),misfirePolicy,maxAttempts:3,backoffMinutes:5,
      })})
      const payload=await response.json()
      if(!response.ok) throw new Error(payload.error??'Unable to create schedule.')
      setMessage('Schedule created.')
      await refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to create schedule.')}finally{setBusy(false)}
  }
  async function patch(id:string,body:Record<string,unknown>){
    const response=await fetch(`/api/schedules/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const payload=await response.json()
    if(!response.ok) throw new Error(payload.error??'Unable to update schedule.')
    await refresh()
  }
  async function remove(id:string){
    const response=await fetch(`/api/schedules/${id}`,{method:'DELETE'})
    const payload=await response.json()
    if(!response.ok) throw new Error(payload.error??'Unable to delete schedule.')
    await refresh()
  }

  return <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
    <form onSubmit={create} className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-blue-600"/><h2 className="text-xl font-bold">New recurring schedule</h2></div>
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">Project<select value={projectId} onChange={e=>{setProjectId(e.target.value);setDatasetVersionId('')}} className="mt-1 w-full rounded-xl border px-3 py-2.5">{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Dataset version<select value={datasetVersionId||eligibleVersions[0]?.id||''} onChange={e=>setDatasetVersionId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{eligibleVersions.map(v=><option key={v.id} value={v.id}>{versionLabels.get(v.id)} · {v.status}</option>)}</select></label>
        <label className="text-sm font-semibold">Job type<select value={jobType} onChange={e=>setJobType(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="PROFILING">Profiling + downstream DQ</option><option value="DATA_QUALITY">Data Quality only</option></select></label>
        <label className="text-sm font-semibold">Schedule name<input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
        <label className="text-sm font-semibold">Cadence<select value={cadence} onChange={e=>setCadence(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>HOURLY</option><option>DAILY</option><option>WEEKLY</option><option>INTERVAL</option></select></label>
        {cadence==='INTERVAL'?<label className="text-sm font-semibold">Interval minutes<input type="number" min="1" value={intervalMinutes} onChange={e=>setIntervalMinutes(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>:<div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Hour UTC<input type="number" min="0" max="23" value={runHour} onChange={e=>setRunHour(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Minute<input type="number" min="0" max="59" value={runMinute} onChange={e=>setRunMinute(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>}
        {cadence==='WEEKLY'?<label className="text-sm font-semibold">Day of week<select value={dayOfWeek} onChange={e=>setDayOfWeek(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option></select></label>:null}
        <label className="text-sm font-semibold">Missed-run handling<select value={misfirePolicy} onChange={e=>setMisfirePolicy(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="RUN_ONCE">Run once when service recovers</option><option value="SKIP">Skip missed occurrence</option><option value="CATCH_UP">Catch up</option></select></label>
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create schedule</button>
        {message?<p className="text-sm text-slate-600">{message}</p>:null}
      </div>
    </form>

    <section className="rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Run calendar</h2><p className="mt-1 text-sm text-slate-500">Durable schedules survive browser sessions and retry according to the configured policy.</p><div className="mt-5 space-y-3">{schedules.length?schedules.map(s=><article key={s.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{s.name}</span><span className="rounded-full border px-2 py-0.5 text-xs font-bold">{s.job_type}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.enabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{s.enabled?'ENABLED':'PAUSED'}</span></div><p className="mt-1 text-sm text-slate-500">{versionLabels.get(s.dataset_version_id)??s.dataset_version_id}</p><p className="mt-2 text-xs text-slate-400">{s.cadence} · next {new Date(s.next_run_at).toLocaleString()} · misfire {s.misfire_policy} · retries {String(s.retry_policy?.max_attempts??3)}</p></div><div className="flex gap-2"><button onClick={()=>void patch(s.id,{enabled:!s.enabled})} className="rounded-lg border p-2" title={s.enabled?'Pause':'Resume'}>{s.enabled?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button><button onClick={()=>void remove(s.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div></div></article>):<div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">No recurring jobs configured.</div>}</div></section>
  </div>
}
