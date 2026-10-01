'use client'
import { useState } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'

const samples:Record<string,unknown>={
  POWER_BI:{items:[{id:'model-1',type:'semantic model',name:'Customer 360 Model',workspace:'Finance',sources:['warehouse.customer'],metadata:{refresh:'scheduled'}}]},
  TABLEAU:{items:[{id:'wb-1',type:'workbook',name:'Customer 360',project:'Analytics',sources:['warehouse.customer']}]},
  LOOKER:{items:[{id:'exp-1',type:'explore',name:'customer_explore',project:'commerce',sources:['warehouse.customer_fact']}]},
}

type Project={id:string;name:string;canPersistCatalog:boolean;canPersistLineage:boolean}
type NormalizedAsset={externalId:string;assetType:string;name:string;container:string|null;upstream:string[];expression:string|null}
export function BiMetadataWorkbench({projects}:{projects:Project[]}){
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const selectedProject=projects.find(project=>project.id===projectId)
  const [provider,setProvider]=useState('POWER_BI')
  const [payload,setPayload]=useState(JSON.stringify(samples.POWER_BI,null,2))
  const [result,setResult]=useState<Record<string,unknown>|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  function choose(value:string){setProvider(value);setPayload(JSON.stringify(samples[value],null,2));setResult(null);setError('')}
  async function persistCatalog(){
    if(!projectId){setError('Select a project before persisting BI metadata.');return}
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/catalog/bi/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,provider,payload:JSON.parse(payload)})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'Unable to persist BI metadata.')
      setResult({...body,mode:'CATALOG_PERSISTED',liveVendorApiCalled:false})
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to persist BI metadata.')}finally{setBusy(false)}
  }

  async function persistLineage(){
    if(!projectId){setError('Select a project before persisting BI lineage.');return}
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/catalog/bi/normalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,payload:JSON.parse(payload)})})
      const normalized=await response.json()
      if(!response.ok)throw new Error(normalized.error??'BI metadata normalization failed.')
      const assets=(normalized.assets??[]) as NormalizedAsset[]
      const relationships=assets.flatMap(asset=>asset.upstream.map((source,index)=>({
        id:`${asset.externalId}:${index}`,
        workspace:asset.container??provider,
        name:asset.name,
        source,
        target:`${provider.toLowerCase()}.${asset.externalId}`,
        operation:asset.assetType,
        expression:asset.expression,
      })))
      if(!relationships.length)throw new Error('No upstream BI relationships were present in the metadata payload.')
      const lineageResponse=await fetch('/api/lineage/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,integrationType:provider,sourceKey:`bi-import:${provider.toLowerCase()}`,relationships})})
      const lineage=await lineageResponse.json()
      if(!lineageResponse.ok)throw new Error(lineage.error??'Unable to persist BI lineage.')
      setResult({...normalized,lineageImport:{eventCount:lineage.eventCount??0,edgeCount:lineage.edgeCount??0,transformationCount:lineage.transformationCount??0,persisted:true}})
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to persist BI lineage.')}finally{setBusy(false)}
  }

  async function run(){
    setBusy(true);setError('');setResult(null)
    try{
      const response=await fetch('/api/catalog/bi/normalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,payload:JSON.parse(payload)})})
      const body=await response.json()
      if(!response.ok)throw new Error(body.error??'BI metadata normalization failed.')
      setResult(body)
    }catch(cause){setError(cause instanceof Error?cause.message:'BI metadata normalization failed.')}finally{setBusy(false)}
  }
  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-300"/><h2 className="text-xl font-black">BI metadata adapter</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">Normalize exported Power BI, Tableau or Looker metadata into DataNexus BI assets before governed persistence and lineage ingestion.</p><label className="mt-4 block text-xs font-bold text-slate-300">Governed project<select value={projectId} onChange={e=>setProjectId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3 py-2.5 text-sm text-white">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="mt-4 flex gap-2">{Object.keys(samples).map(item=><button key={item} type="button" onClick={()=>choose(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${provider===item?'bg-cyan-600 text-white':'bg-white/[0.05] text-slate-400'}`}>{item.replace('_',' ')}</button>)}</div><textarea value={payload} onChange={e=>setPayload(e.target.value)} rows={20} className="mt-4 w-full rounded-2xl border border-white/10 bg-[#07101c] p-4 font-mono text-xs leading-5 text-slate-200"/><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>void run()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<BarChart3 className="h-4 w-4"/>}Normalize BI metadata</button><button type="button" onClick={()=>void persistCatalog()} disabled={busy||!projectId||!selectedProject?.canPersistCatalog} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-50">Persist BI catalog metadata</button><button type="button" onClick={()=>void persistLineage()} disabled={busy||!projectId||!selectedProject?.canPersistLineage} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-sm font-bold text-violet-200 hover:bg-violet-400/15 disabled:opacity-50">Persist source-to-report lineage</button></div>{selectedProject&&(!selectedProject.canPersistCatalog||!selectedProject.canPersistLineage)?<div className="mt-2 space-y-1 text-xs text-amber-300">{!selectedProject.canPersistCatalog?<p>catalog.update permission is required to persist BI catalog metadata.</p>:null}{!selectedProject.canPersistLineage?<p>lineage.manage permission is required to persist source-to-report lineage.</p>:null}</div>:null}{error?<p className="mt-3 text-sm text-rose-300">{error}</p>:null}</section><section className="rounded-3xl border border-white/10 bg-[#102036] p-6"><p className="text-xs font-black uppercase tracking-wide text-violet-300">Normalized BI assets</p>{result?<pre className="mt-4 max-h-[640px] overflow-auto rounded-2xl border border-white/[0.07] bg-[#07101c] p-4 text-[11px] leading-5 text-slate-300">{JSON.stringify(result,null,2)}</pre>:<p className="mt-4 text-sm leading-6 text-slate-500">Select a provider and normalize a metadata export. You can persist the normalized catalog evidence and source-to-report lineage when authorized. No live vendor API is called by this import workspace.</p>}</section></div>
}
