'use client'

import { FormEvent, useMemo, useState } from 'react'
import { BrainCircuit, CheckCircle2, GitBranch, Loader2, PlayCircle, Plus, ShieldCheck, Wrench, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Project={id:string;name:string}
type Definition={id:string;project_id:string;workflow_key:string;name:string;entity_type:string;version:number;steps:Array<{name:string;capability:string;description?:string|null}>;enabled:boolean}
type Instance={id:string;project_id:string;workflow_definition_id:string;entity_type:string;entity_id:string;status:string;current_step:number;context:Record<string,unknown>;started_at:string;completed_at:string|null}
type Outcome={id:string;project_id:string;workflow_instance_id:string;source_profile_run_id:string;verification_profile_run_id:string|null;status:string;execution_mode:string|null;quality_score_delta:number|string|null;high_severity_findings_delta:number|null;checks:Record<string,unknown>;outcome:Record<string,unknown>;updated_at:string;verified_at:string|null}
type Learning={id:string;project_id:string;workflow_instance_id:string;recommendation_action:string;status:string;effective:boolean|null;quality_score_delta:number|string|null;high_severity_findings_delta:number|null;observed_at:string|null}
type LearningSummary={action:string;attempts:number;effective:number;ineffective:number;successRate:number|null;averageQualityDelta:number|null;averageSeverityDelta:number|null}

const capabilities=['policy.approve','certification.review','classification.review','contract.approve','workflow.manage','stewardship.manage','quality.exception.approve']
const text=(value:unknown)=>typeof value==='string'?value:''
const number=(value:unknown)=>{const parsed=typeof value==='number'?value:Number(value);return Number.isFinite(parsed)?parsed:null}

export function WorkflowManager({projects,definitions,instances,outcomes,learning}:{projects:Project[];definitions:Definition[];instances:Instance[];outcomes:Outcome[];learning:Learning[]}){
  const router=useRouter()
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [workflowKey,setWorkflowKey]=useState('CERTIFICATION_APPROVAL')
  const [name,setName]=useState('Dataset certification approval')
  const [entityType,setEntityType]=useState('DATASET')
  const [steps,setSteps]=useState([{name:'Steward review',capability:'certification.review',description:'Validate ownership, controls and evidence.'},{name:'Policy approval',capability:'policy.approve',description:'Approve the governed asset for certification.'}])
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const projectDefinitions=definitions.filter(definition=>definition.project_id===projectId)
  const definitionById=useMemo(()=>new Map(definitions.map(item=>[item.id,item])),[definitions])
  const outcomeByWorkflow=useMemo(()=>new Map(outcomes.map(item=>[item.workflow_instance_id,item])),[outcomes])
  const learningSummary=useMemo<LearningSummary[]>(()=>{
    const grouped=new Map<string,Learning[]>()
    for(const row of learning.filter(item=>item.project_id===projectId&&['EFFECTIVE','INEFFECTIVE'].includes(item.status))){const rows=grouped.get(row.recommendation_action)??[];rows.push(row);grouped.set(row.recommendation_action,rows)}
    return [...grouped.entries()].map(([action,rows])=>{const effective=rows.filter(row=>row.effective===true||row.status==='EFFECTIVE').length;const ineffective=rows.filter(row=>row.effective===false||row.status==='INEFFECTIVE').length;const attempts=effective+ineffective;const quality=rows.map(row=>number(row.quality_score_delta)).filter((value):value is number=>value!==null);const severity=rows.map(row=>number(row.high_severity_findings_delta)).filter((value):value is number=>value!==null);return{action,attempts,effective,ineffective,successRate:attempts?effective/attempts:null,averageQualityDelta:quality.length?quality.reduce((sum,value)=>sum+value,0)/quality.length:null,averageSeverityDelta:severity.length?severity.reduce((sum,value)=>sum+value,0)/severity.length:null}}).sort((a,b)=>b.attempts-a.attempts||a.action.localeCompare(b.action))
  },[learning,projectId])

  async function create(event:FormEvent){
    event.preventDefault();setBusy('create');setMessage('')
    try{
      const response=await fetch('/api/workflows/definitions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,workflowKey,name,entityType,steps})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to create workflow.')
      setMessage(`Workflow ${payload.definition?.workflow_key??workflowKey} v${payload.definition?.version??'?'} created.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to create workflow.')}finally{setBusy('')}
  }

  async function act(instanceId:string,action:'APPROVE'|'REJECT'){
    setBusy(instanceId);setMessage('')
    try{
      const response=await fetch(`/api/workflows/instances/${instanceId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to update workflow.')
      setMessage(`Workflow ${action.toLowerCase()} action recorded.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to update workflow.')}finally{setBusy('')}
  }

  async function remediate(instanceId:string){
    setBusy(`remediate:${instanceId}`);setMessage('')
    try{
      const response=await fetch('/api/profiling/remediation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflowInstanceId:instanceId})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to create governed remediation actions.')
      setMessage(`Remediation tracked. ${payload.created?.length??0} issue(s) created, ${payload.reused?.length??0} reused. ${payload.learningActions?.length??0} learning signal(s) seeded.`)
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to create governed remediation actions.')}finally{setBusy('')}
  }

  async function verify(instanceId:string){
    setBusy(`verify:${instanceId}`);setMessage('')
    try{
      const response=await fetch('/api/profiling/remediation/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflowInstanceId:instanceId})})
      const payload=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(payload.error??'Unable to verify remediation.')
      setMessage(payload.recommendationEffective?'Remediation verified and recommendation marked effective.':'Remediation verified; recommendation effectiveness was recorded.')
      router.refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to verify remediation.')}finally{setBusy('')}
  }

  return <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
    <form onSubmit={create} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-bold">Workflow definition</h2></div>
      <p className="mt-1 text-sm text-slate-500">Create versioned approval flows with capability-based steps.</p>
      <div className="mt-5 grid gap-4">
        <label className="text-sm font-semibold">Project<select value={projectId} onChange={event=>setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Workflow key<input value={workflowKey} onChange={event=>setWorkflowKey(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-xs"/></label>
        <label className="text-sm font-semibold">Name<input value={name} onChange={event=>setName(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
        <label className="text-sm font-semibold">Entity type<input value={entityType} onChange={event=>setEntityType(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
        <div><div className="flex items-center justify-between"><span className="text-sm font-semibold">Approval steps</span><button type="button" onClick={()=>setSteps([...steps,{name:`Step ${steps.length+1}`,capability:'policy.approve',description:''}])} className="inline-flex items-center gap-1 text-xs font-bold text-violet-600"><Plus className="h-3.5 w-3.5"/>Add step</button></div><div className="mt-2 space-y-2">{steps.map((step,index)=><div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><input value={step.name} onChange={event=>setSteps(steps.map((item,i)=>i===index?{...item,name:event.target.value}:item))} className="w-full rounded-lg border px-3 py-2 text-sm"/><select value={step.capability} onChange={event=>setSteps(steps.map((item,i)=>i===index?{...item,capability:event.target.value}:item))} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm">{capabilities.map(capability=><option key={capability}>{capability}</option>)}</select><input value={step.description??''} onChange={event=>setSteps(steps.map((item,i)=>i===index?{...item,description:event.target.value}:item))} placeholder="Step description" className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"/>{steps.length>1?<button type="button" onClick={()=>setSteps(steps.filter((_,i)=>i!==index))} className="mt-2 text-xs font-bold text-red-600">Remove</button>:null}</div>)}</div></div>
        <button disabled={busy==='create'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white hover:bg-violet-700 disabled:opacity-50">{busy==='create'?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create workflow version</button>
        {message?<p className="text-sm text-slate-600">{message}</p>:null}
      </div>
    </form>

    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Definitions</h2><div className="mt-4 space-y-3">{projectDefinitions.length?projectDefinitions.map(definition=><article key={definition.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-bold">{definition.name}</div><div className="mt-1 text-xs text-slate-500">{definition.workflow_key} · v{definition.version} · {definition.entity_type}</div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{definition.enabled?'ENABLED':'DISABLED'}</span></div><div className="mt-3 flex flex-wrap gap-2">{definition.steps.map((step,index)=><span key={index} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{index+1}. {step.name}</span>)}</div></article>):<div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">No workflow definitions for this project.</div>}</div></section>
      <section className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-violet-600"/><h2 className="text-xl font-bold">Recommendation effectiveness</h2></div><p className="mt-1 text-sm text-slate-500">Observed outcomes from approved profiling remediation. Historical effectiveness is advisory evidence only.</p><div className="mt-4 space-y-3">{learningSummary.length?learningSummary.map(row=><article key={row.action} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-sm font-bold">{row.action}</div><div className="mt-1 text-xs text-slate-500">{row.attempts} verified attempt(s) · {row.effective} effective · {row.ineffective} ineffective</div></div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{row.successRate===null?'n/a':`${Math.round(row.successRate*100)}%`} success</span></div><div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><div>Average quality delta: {row.averageQualityDelta===null?'n/a':row.averageQualityDelta.toFixed(4)}</div><div>Average high-severity finding delta: {row.averageSeverityDelta===null?'n/a':row.averageSeverityDelta.toFixed(2)}</div></div></article>):<div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">No verified recommendation outcomes yet. Learning signals appear after governed remediation verification.</div>}</div></section>
      <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><PlayCircle className="h-5 w-5 text-blue-600"/><h2 className="text-xl font-bold">Workflow instances</h2></div><div className="mt-4 space-y-3">{instances.filter(instance=>instance.project_id===projectId).length?instances.filter(instance=>instance.project_id===projectId).map(instance=>{const definition=definitionById.get(instance.workflow_definition_id);const outcome=outcomeByWorkflow.get(instance.id);const isProfiling=instance.entity_type==='PROFILE_RUN'&&instance.context?.source==='PROFILING_INVESTIGATION';const recommendations=Array.isArray(instance.context?.recommendations)?instance.context.recommendations.length:0;const qualityDelta=number(outcome?.quality_score_delta);return <article key={instance.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{definition?.name??instance.entity_type}</div><div className="mt-1 text-xs text-slate-500">{instance.entity_type} · {instance.entity_id.slice(0,8)} · step {instance.current_step+1}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${instance.status==='RUNNING'?'bg-amber-50 text-amber-700':instance.status==='APPROVED'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{instance.status}</span></div>{isProfiling?<div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Risk {text(instance.context.risk)||text(instance.context.investigation_risk)||'UNKNOWN'}</span><span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">{recommendations} governed recommendation(s)</span>{outcome?<span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">{outcome.status}</span>:null}</div>{text(instance.context.business_issue)?<p className="mt-2 text-slate-700">{text(instance.context.business_issue)}</p>:null}{text(instance.context.business_impact)?<p className="mt-1 text-xs text-slate-500">{text(instance.context.business_impact)}</p>:null}{outcome?<div className="mt-2 text-xs text-slate-600">Quality delta: {qualityDelta===null?'n/a':qualityDelta.toFixed(4)} · High-severity finding delta: {outcome.high_severity_findings_delta??'n/a'}</div>:null}</div>:null}{instance.status==='RUNNING'?<div className="mt-3 flex gap-2"><button disabled={busy===instance.id} onClick={()=>void act(instance.id,'APPROVE')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5"/>Approve step</button><button disabled={busy===instance.id} onClick={()=>void act(instance.id,'REJECT')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><XCircle className="h-3.5 w-3.5"/>Reject</button></div>:null}{isProfiling&&instance.status==='APPROVED'?<div className="mt-3 flex flex-wrap gap-2"><button disabled={busy===`remediate:${instance.id}`} onClick={()=>void remediate(instance.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy===`remediate:${instance.id}`?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Wrench className="h-3.5 w-3.5"/>}Track remediation</button><button disabled={busy===`verify:${instance.id}`} onClick={()=>void verify(instance.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50">{busy===`verify:${instance.id}`?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<ShieldCheck className="h-3.5 w-3.5"/>}Verify latest profile</button></div>:null}</article>}):<div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">No workflow instances have been started.</div>}</div></section>
    </div>
  </div>
}
