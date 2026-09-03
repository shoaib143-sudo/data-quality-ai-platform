'use client'

import { FormEvent, useMemo, useState } from 'react'
import { CheckCircle2, GitBranch, Loader2, PlayCircle, Plus, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Project={id:string;name:string}
type Definition={id:string;project_id:string;workflow_key:string;name:string;entity_type:string;version:number;steps:Array<{name:string;capability:string;description?:string|null}>;enabled:boolean}
type Instance={id:string;project_id:string;workflow_definition_id:string;entity_type:string;entity_id:string;status:string;current_step:number;context:Record<string,unknown>;started_at:string;completed_at:string|null}

const capabilities=['policy.approve','certification.review','classification.review','contract.approve','workflow.manage','stewardship.manage','quality.exception.approve']

export function WorkflowManager({projects,definitions,instances}:{projects:Project[];definitions:Definition[];instances:Instance[]}){
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
      <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><PlayCircle className="h-5 w-5 text-blue-600"/><h2 className="text-xl font-bold">Active workflow instances</h2></div><div className="mt-4 space-y-3">{instances.filter(instance=>instance.project_id===projectId).length?instances.filter(instance=>instance.project_id===projectId).map(instance=>{const definition=definitionById.get(instance.workflow_definition_id);return <article key={instance.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{definition?.name??instance.entity_type}</div><div className="mt-1 text-xs text-slate-500">{instance.entity_type} · {instance.entity_id.slice(0,8)} · step {instance.current_step+1}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${instance.status==='RUNNING'?'bg-amber-50 text-amber-700':instance.status==='APPROVED'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{instance.status}</span></div>{instance.status==='RUNNING'?<div className="mt-3 flex gap-2"><button disabled={busy===instance.id} onClick={()=>void act(instance.id,'APPROVE')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-3.5 w-3.5"/>Approve step</button><button disabled={busy===instance.id} onClick={()=>void act(instance.id,'REJECT')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"><XCircle className="h-3.5 w-3.5"/>Reject</button></div>:null}</article>}):<div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">No workflow instances have been started.</div>}</div></section>
    </div>
  </div>
}
