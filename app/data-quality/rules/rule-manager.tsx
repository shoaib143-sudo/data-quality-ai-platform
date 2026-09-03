'use client'
import { FormEvent, useMemo, useState } from 'react'
import { Check, Edit3, Loader2, Plus, Save, Trash2, X } from 'lucide-react'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}
type Version={id:string;dataset_id:string;version_number:number;status:string}
type Rule={id:string;project_id:string;dataset_id:string;dataset_version_id:string|null;column_name:string|null;rule_key:string;name:string;description:string|null;dimension:string;severity:string;metric_key:string;operator:string;threshold:number|null;enabled:boolean;origin:string;rule_type:string;rule_config:Record<string,unknown>}

const ruleTypes=['METRIC_THRESHOLD','REQUIRED','REGEX','UNIQUE','RANGE','IN_SET','ROW_UNIQUE']
const dimensions=['COMPLETENESS','UNIQUENESS','VALIDITY','ACCURACY','CONSISTENCY','TIMELINESS']
const severities=['INFO','LOW','MEDIUM','HIGH','CRITICAL']

export function RuleManager({projects,datasets,versions,initialRules}:{projects:Project[];datasets:Dataset[];versions:Version[];initialRules:Rule[]}){
  const [rules,setRules]=useState(initialRules)
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const projectDatasets=datasets.filter(d=>d.project_id===projectId)
  const [datasetId,setDatasetId]=useState(projectDatasets[0]?.id??'')
  const effectiveDatasetId=projectDatasets.some(d=>d.id===datasetId)?datasetId:projectDatasets[0]?.id??''
  const datasetVersions=versions.filter(v=>v.dataset_id===effectiveDatasetId)
  const [datasetVersionId,setDatasetVersionId]=useState('')
  const [name,setName]=useState('New governance rule')
  const [columnName,setColumnName]=useState('')
  const [ruleType,setRuleType]=useState('REQUIRED')
  const [dimension,setDimension]=useState('COMPLETENESS')
  const [severity,setSeverity]=useState('MEDIUM')
  const [metricKey,setMetricKey]=useState('null_rate')
  const [operator,setOperator]=useState('LTE')
  const [threshold,setThreshold]=useState('0')
  const [configText,setConfigText]=useState('{}')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [editingId,setEditingId]=useState<string|null>(null)
  const datasetById=useMemo(()=>new Map(datasets.map(d=>[d.id,d])),[datasets])

  async function refresh(){
    const response=await fetch('/api/data-quality/rules')
    const payload=await response.json()
    if(response.ok)setRules(payload.rules??[])
  }

  async function create(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage('')
    try{
      let ruleConfig={}
      try{ruleConfig=JSON.parse(configText||'{}')}catch{throw new Error('Rule configuration must be valid JSON.')}
      if(!effectiveDatasetId)throw new Error('Select a dataset.')
      const version=datasetVersionId||datasetVersions[0]?.id||null
      const response=await fetch('/api/data-quality/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,datasetId:effectiveDatasetId,datasetVersionId:version,columnName:columnName||null,name,dimension,severity,ruleType,metricKey,operator,threshold:Number(threshold),ruleConfig,
      })})
      const payload=await response.json()
      if(!response.ok)throw new Error(payload.error??'Unable to create rule.')
      setMessage('Rule created.')
      await refresh()
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to create rule.')}finally{setBusy(false)}
  }

  async function patch(id:string,body:Record<string,unknown>){
    const response=await fetch(`/api/data-quality/rules/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    const payload=await response.json()
    if(!response.ok)throw new Error(payload.error??'Unable to update rule.')
    await refresh()
  }

  async function remove(id:string){
    const response=await fetch(`/api/data-quality/rules/${id}`,{method:'DELETE'})
    const payload=await response.json()
    if(!response.ok)throw new Error(payload.error??'Unable to delete rule.')
    await refresh()
  }

  return <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
    <form onSubmit={create} className="rounded-3xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Create custom rule</h2><div className="mt-5 grid gap-4">
      <label className="text-sm font-semibold">Project<select value={projectId} onChange={e=>{setProjectId(e.target.value);setDatasetId('');setDatasetVersionId('')}} className="mt-1 w-full rounded-xl border px-3 py-2.5">{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Dataset<select value={effectiveDatasetId} onChange={e=>{setDatasetId(e.target.value);setDatasetVersionId('')}} className="mt-1 w-full rounded-xl border px-3 py-2.5">{projectDatasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Dataset version<select value={datasetVersionId||datasetVersions[0]?.id||''} onChange={e=>setDatasetVersionId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{datasetVersions.map(v=><option key={v.id} value={v.id}>v{v.version_number} · {v.status}</option>)}</select></label>
      <label className="text-sm font-semibold">Rule name<input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
      <label className="text-sm font-semibold">Column<input value={columnName} onChange={e=>setColumnName(e.target.value)} placeholder="Leave blank for dataset-level rule" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Rule type<select value={ruleType} onChange={e=>setRuleType(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{ruleTypes.map(v=><option key={v}>{v}</option>)}</select></label><label className="text-sm font-semibold">Dimension<select value={dimension} onChange={e=>setDimension(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{dimensions.map(v=><option key={v}>{v}</option>)}</select></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Severity<select value={severity} onChange={e=>setSeverity(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">{severities.map(v=><option key={v}>{v}</option>)}</select></label><label className="text-sm font-semibold">Metric key<input value={metricKey} onChange={e=>setMetricKey(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Operator<select value={operator} onChange={e=>setOperator(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option>LTE</option><option>GTE</option><option>EQ</option><option>NEQ</option></select></label><label className="text-sm font-semibold">Threshold<input type="number" step="any" value={threshold} onChange={e=>setThreshold(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div>
      <label className="text-sm font-semibold">Rule config JSON<textarea value={configText} onChange={e=>setConfigText(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-xs" placeholder='{"pattern":"^[A-Z]+$"}'/></label>
      <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create rule</button>{message?<p className="text-sm text-slate-600">{message}</p>:null}
    </div></form>

    <section className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Governed rule library</h2><p className="mt-1 text-sm text-slate-500">Suggested and custom controls. Changes apply to future executions.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{rules.filter(r=>r.enabled).length} enabled</span></div>
      <div className="mt-5 space-y-3">{rules.length?rules.map(rule=>{
        const editing=editingId===rule.id
        return <article key={rule.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{rule.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{rule.rule_type}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rule.enabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{rule.enabled?'ENABLED':'DISABLED'}</span></div><p className="mt-1 text-xs text-slate-500">{datasetById.get(rule.dataset_id)?.name??rule.dataset_id} · {rule.column_name??'Dataset'} · {rule.dimension} · {rule.severity}</p></div><div className="flex gap-2"><button onClick={()=>void patch(rule.id,{enabled:!rule.enabled})} className="rounded-lg border p-2" title={rule.enabled?'Disable':'Enable'}>{rule.enabled?<X className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button><button onClick={()=>setEditingId(editing?null:rule.id)} className="rounded-lg border p-2"><Edit3 className="h-4 w-4"/></button><button onClick={()=>void remove(rule.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div></div>
          {editing?<InlineEdit rule={rule} onSave={async body=>{await patch(rule.id,body);setEditingId(null)}}/>:<p className="text-sm text-slate-600">{rule.metric_key} {rule.operator} {rule.threshold??'N/A'} · origin {rule.origin}</p>}
        </div></article>
      }):<div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">No data quality rules configured.</div>}</div>
    </section>
  </div>
}

function InlineEdit({rule,onSave}:{rule:Rule;onSave:(body:Record<string,unknown>)=>Promise<void>}){
  const [name,setName]=useState(rule.name)
  const [severity,setSeverity]=useState(rule.severity)
  const [dimension,setDimension]=useState(rule.dimension)
  const [threshold,setThreshold]=useState(String(rule.threshold??0))
  const [config,setConfig]=useState(JSON.stringify(rule.rule_config??{},null,2))
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function save(){setBusy(true);setError('');try{await onSave({name,severity,dimension,threshold:Number(threshold),ruleConfig:JSON.parse(config||'{}')})}catch(e){setError(e instanceof Error?e.message:'Unable to save rule.')}finally{setBusy(false)}}
  return <div className="grid gap-3 rounded-xl bg-slate-50 p-3"><input value={name} onChange={e=>setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"/><div className="grid grid-cols-3 gap-2"><select value={severity} onChange={e=>setSeverity(e.target.value)} className="rounded-lg border px-2 py-2 text-sm">{severities.map(v=><option key={v}>{v}</option>)}</select><select value={dimension} onChange={e=>setDimension(e.target.value)} className="rounded-lg border px-2 py-2 text-sm">{dimensions.map(v=><option key={v}>{v}</option>)}</select><input type="number" step="any" value={threshold} onChange={e=>setThreshold(e.target.value)} className="rounded-lg border px-2 py-2 text-sm"/></div><textarea value={config} onChange={e=>setConfig(e.target.value)} rows={3} className="rounded-lg border px-3 py-2 font-mono text-xs"/><div className="flex items-center gap-2"><button type="button" onClick={()=>void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save</button>{error?<span className="text-xs text-red-600">{error}</span>:null}</div></div>
}
