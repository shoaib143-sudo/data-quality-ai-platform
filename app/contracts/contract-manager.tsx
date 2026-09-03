'use client'

import { FormEvent, useMemo, useState } from 'react'
import { CheckCircle2, FileCheck2, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}
type Contract={id:string;project_id:string;dataset_id:string;name:string;status:string;current_version:number}
type Version={id:string;contract_id:string;version_number:number;schema_hash:string|null;compatibility_policy:string;freshness_sla_hours:number|null;row_count_min:number|null;row_count_max:number|null;quality_requirements:Record<string,unknown>;critical_columns:string[];status:string;change_reason:string|null;effective_at:string|null;created_at:string}
type Profile={id:string;dataset_id:string;schema_hash:string|null;row_count:number|null;overall_score:number|null}

export function ContractManager({projects,datasets,contracts,versions,profiles}:{projects:Project[];datasets:Dataset[];contracts:Contract[];versions:Version[];profiles:Profile[]}){
  const router=useRouter()
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const projectDatasets=datasets.filter(dataset=>dataset.project_id===projectId)
  const [datasetId,setDatasetId]=useState(projectDatasets[0]?.id??'')
  const effectiveDatasetId=projectDatasets.some(dataset=>dataset.id===datasetId)?datasetId:projectDatasets[0]?.id??''
  const dataset=datasets.find(item=>item.id===effectiveDatasetId)
  const contract=contracts.find(item=>item.dataset_id===effectiveDatasetId)
  const latestProfile=profiles.find(item=>item.dataset_id===effectiveDatasetId)
  const contractVersions=useMemo(()=>versions.filter(version=>version.contract_id===contract?.id).sort((a,b)=>b.version_number-a.version_number),[versions,contract?.id])

  const [name,setName]=useState('')
  const [schemaHash,setSchemaHash]=useState('')
  const [compatibility,setCompatibility]=useState('BACKWARD')
  const [freshness,setFreshness]=useState('24')
  const [rowMin,setRowMin]=useState('')
  const [rowMax,setRowMax]=useState('')
  const [overall,setOverall]=useState('0.85')
  const [completeness,setCompleteness]=useState('0.95')
  const [uniqueness,setUniqueness]=useState('')
  const [validity,setValidity]=useState('0.95')
  const [criticalColumns,setCriticalColumns]=useState('')
  const [reason,setReason]=useState('')
  const [activate,setActivate]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  function switchDataset(id:string){
    setDatasetId(id)
    const existing=contracts.find(item=>item.dataset_id===id)
    const profile=profiles.find(item=>item.dataset_id===id)
    setName(existing?.name??'')
    setSchemaHash(profile?.schema_hash??'')
    setRowMin(profile?.row_count!==null&&profile?.row_count!==undefined?String(Math.max(0,Math.floor(profile.row_count*0.5))):'')
    setRowMax(profile?.row_count!==null&&profile?.row_count!==undefined?String(Math.ceil(profile.row_count*1.5)):'')
    setMessage('')
  }

  async function save(event:FormEvent){
    event.preventDefault();if(!effectiveDatasetId)return
    setBusy(true);setMessage('')
    try{
      const idempotencyKey=crypto.randomUUID()
      const qualityRequirements:Record<string,number>={}
      if(overall.trim())qualityRequirements.min_overall_score=Number(overall)
      if(completeness.trim())qualityRequirements.min_completeness_score=Number(completeness)
      if(uniqueness.trim())qualityRequirements.min_uniqueness_score=Number(uniqueness)
      if(validity.trim())qualityRequirements.min_validity_score=Number(validity)
      const response=await fetch('/api/contracts',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({
        projectId,datasetId:effectiveDatasetId,name:name||`${dataset?.name??'Dataset'} data contract`,
        schemaHash:schemaHash||null,compatibilityPolicy:compatibility,freshnessSlaHours:freshness?Number(freshness):null,
        rowCountMin:rowMin?Number(rowMin):null,rowCountMax:rowMax?Number(rowMax):null,qualityRequirements,
        criticalColumns:criticalColumns.split(',').map(value=>value.trim()).filter(Boolean),changeReason:reason||null,activate,idempotencyKey,
      })})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to save data contract.')
      setMessage(`Data contract v${payload.version?.version_number??'?'} saved${activate?' and activated':''}.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to save data contract.')}finally{setBusy(false)}
  }

  return <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
    <form onSubmit={save} className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-blue-600"/><h2 className="text-xl font-bold">Define enforceable contract</h2></div>
      <p className="mt-1 text-sm text-slate-500">Contract versions preserve schema, quality, freshness and volume expectations against future profiling evidence.</p>
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">Project<select value={projectId} onChange={event=>{setProjectId(event.target.value);setDatasetId('');setMessage('')}} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Dataset<select value={effectiveDatasetId} onChange={event=>switchDataset(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5">{projectDatasets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Contract name<input value={name} onChange={event=>setName(event.target.value)} placeholder={`${dataset?.name??'Dataset'} data contract`} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Schema hash<input value={schemaHash} onChange={event=>setSchemaHash(event.target.value)} placeholder={latestProfile?.schema_hash??'Optional exact schema fingerprint'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs"/></label><label className="text-sm font-semibold">Compatibility<select value={compatibility} onChange={event=>setCompatibility(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"><option>NONE</option><option>BACKWARD</option><option>FORWARD</option><option>FULL</option></select></label></div>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Freshness SLA hours<input type="number" min={1} value={freshness} onChange={event=>setFreshness(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Minimum rows<input type="number" min={0} value={rowMin} onChange={event=>setRowMin(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Maximum rows<input type="number" min={0} value={rowMax} onChange={event=>setRowMax(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Min overall score<input type="number" step="0.01" min={0} max={1} value={overall} onChange={event=>setOverall(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Min completeness<input type="number" step="0.01" min={0} max={1} value={completeness} onChange={event=>setCompleteness(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Min uniqueness<input type="number" step="0.01" min={0} max={1} value={uniqueness} onChange={event=>setUniqueness(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Min validity<input type="number" step="0.01" min={0} max={1} value={validity} onChange={event=>setValidity(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>
        <label className="text-sm font-semibold">Critical columns<input value={criticalColumns} onChange={event=>setCriticalColumns(event.target.value)} placeholder="customer_id,email,signup_date" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
        <label className="text-sm font-semibold">Change reason<textarea value={reason} onChange={event=>setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2.5" placeholder="Why this contract version is changing"/></label>
        <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><input type="checkbox" checked={activate} onChange={event=>setActivate(event.target.checked)} className="mt-1"/><span><span className="block font-bold text-emerald-900">Activate immediately</span><span className="text-xs text-emerald-800">Activation evaluates the latest completed profile and aligns the dataset freshness SLA.</span></span></label>
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create contract version</button>
        {message?<p className={`text-sm font-medium ${message.toLowerCase().includes('unable')?'text-red-600':'text-emerald-700'}`}>{message}</p>:null}
      </div>
    </form>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-bold">Contract history</h2></div><p className="mt-1 text-sm text-slate-500">Immutable revisions remain available for audit and compatibility review.</p></div>{contract?<span className={`rounded-full px-3 py-1 text-xs font-bold ${contract.status==='ACTIVE'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{contract.status}</span>:null}</div>
      <div className="mt-5 space-y-3">{contractVersions.length?contractVersions.map(version=><article key={version.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-bold">v{version.version_number}</span>{version.status==='ACTIVE'?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>ACTIVE</span>:<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{version.status}</span>}</div><p className="mt-1 text-xs text-slate-500">{version.compatibility_policy} compatibility · freshness {version.freshness_sla_hours??'N/A'}h</p></div><span className="text-xs text-slate-400">{new Date(version.created_at).toLocaleString()}</span></div><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-lg bg-slate-50 px-3 py-2">Rows: {version.row_count_min??'N/A'} to {version.row_count_max??'N/A'}</div><div className="rounded-lg bg-slate-50 px-3 py-2">Critical columns: {version.critical_columns?.join(', ')||'None'}</div></div>{version.change_reason?<p className="mt-3 text-sm text-slate-600">{version.change_reason}</p>:null}</article>):<div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">No contract versions for this dataset yet.</div>}</div>
    </section>
  </div>
}
