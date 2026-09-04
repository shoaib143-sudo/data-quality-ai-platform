'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Code2, Loader2, Network, Send } from 'lucide-react'

type Project = { id: string; name: string }
type LineageState = { integrations: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; assets: Array<Record<string, unknown>>; transformations:Array<Record<string,unknown>> }

const examples:Record<string,Record<string,unknown>>={
  OPENLINEAGE:{integrationType:'OPENLINEAGE',sourceKey:'openlineage-airflow',eventId:'run-2026-09-04-001',eventType:'COMPLETE',job:{namespace:'finance',name:'customer_master_transform'},inputs:[{namespace:'raw',name:'customers'}],outputs:[{namespace:'curated',name:'customer_master'}],transformation:{operation:'INSERT',logicLanguage:'SQL',logic:'insert into curated.customer_master select * from raw.customers'}},
  DBT:{integrationType:'DBT',sourceKey:'dbt-finance',manifest:{metadata:{generated_at:'2026-09-04T00:00:00Z'},sources:{'source.raw.customers':{name:'customers',database:'analytics',schema:'raw',identifier:'customers'}},nodes:{'model.finance.customer_master':{name:'customer_master',resource_type:'model',package_name:'finance',database:'analytics',schema:'curated',alias:'customer_master',relation_name:'analytics.curated.customer_master',compiled_sql:'select customer_id, full_name, email from analytics.raw.customers',depends_on:{nodes:['source.raw.customers']},config:{materialized:'table'}}}}},
  AIRFLOW:{integrationType:'AIRFLOW',sourceKey:'airflow-finance',dag:{dag_id:'finance_governance',tasks:[{task_id:'build_customer_master',operator:'SQLExecuteQueryOperator',sql:'insert into curated.customer_master select * from raw.customers',inlets:['raw.customers'],outlets:['curated.customer_master']}]}},
  DATABRICKS:{integrationType:'DATABRICKS',sourceKey:'databricks-query-history',relationships:[{id:'statement-001',workspace:'finance-workspace',operation:'CREATE_TABLE_AS_SELECT',sql_text:'create table curated.customer_master as select * from raw.customers',sources:['raw.customers'],targets:['curated.customer_master']}]},
  SNOWFLAKE:{integrationType:'SNOWFLAKE',sourceKey:'snowflake-access-history',relationships:[{query_id:'query-001',warehouse:'GOVERNANCE_WH',query_text:'merge into CURATED.CUSTOMER_MASTER using RAW.CUSTOMERS on CURATED.CUSTOMER_MASTER.ID=RAW.CUSTOMERS.ID when matched then update set FULL_NAME=RAW.CUSTOMERS.FULL_NAME',objects_accessed:['RAW.CUSTOMERS'],objects_modified:['CURATED.CUSTOMER_MASTER']}]},
  POWER_BI:{integrationType:'POWER_BI',sourceKey:'power-bi-lineage',relationships:[{id:'dataset-refresh-001',workspace:'Finance BI',name:'Customer semantic model',source:'curated.customer_master',target:'powerbi.customer_model',operation:'POWER_QUERY',m_expression:'let Source = Sql.Database("server", "warehouse"), Customers = Source{[Schema="curated",Item="customer_master"]}[Data] in Customers'}]},
  TABLEAU:{integrationType:'TABLEAU',sourceKey:'tableau-metadata',relationships:[{id:'workbook-001',workbook:'Customer 360',source:'curated.customer_master',target:'tableau.customer_360',operation:'CUSTOM_SQL',custom_sql:'select country, count(*) customers from curated.customer_master group by country'}]},
  GITHUB_SQL:{integrationType:'GITHUB_SQL',sourceKey:'github-sql',files:[{path:'models/customer_master.sql',repository:'data-platform',sql:'create view curated.customer_master_v as select customer_id, full_name from raw.customers'}]},
  JDBC:{integrationType:'JDBC',sourceKey:'jdbc-metadata',relationships:[{id:'view-customer-master',source:'raw.customers',target:'curated.customer_master_v',operation:'VIEW',sql:'select customer_id, full_name from raw.customers'}]},
}

export function LineageIngestManager({ projects }: { projects: Project[] }) {
  const [projectId,setProjectId]=useState(projects[0]?.id??'')
  const [preset,setPreset]=useState('OPENLINEAGE')
  const [payload,setPayload]=useState(JSON.stringify(examples.OPENLINEAGE,null,2))
  const [state,setState]=useState<LineageState>({integrations:[],events:[],assets:[],transformations:[]})
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const supported=useMemo(()=>Object.keys(examples),[])

  async function load(){
    if(!projectId)return
    const response=await fetch(`/api/lineage/ingest?projectId=${encodeURIComponent(projectId)}`)
    const result=await response.json().catch(()=>({}))
    if(response.ok)setState({integrations:result.integrations??[],events:result.events??[],assets:result.assets??[],transformations:result.transformations??[]})
  }
  useEffect(()=>{void load()},[projectId])
  function choosePreset(value:string){setPreset(value);setPayload(JSON.stringify(examples[value]??examples.OPENLINEAGE,null,2));setMessage('');setError('')}

  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try{
      const parsed=JSON.parse(payload) as Record<string,unknown>
      const response=await fetch('/api/lineage/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...parsed,projectId})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error??'Lineage ingestion failed.')
      setMessage(`${result.eventCount??1} event(s) processed, ${result.edgeCount??0} lineage edges and ${result.transformationCount??0} transformations persisted. ${result.reusedCount?`${result.reusedCount} duplicate event(s) were safely reused.`:''}`)
      await load()
    }catch(cause){setError(cause instanceof Error?cause.message:'Lineage ingestion failed.')}finally{setBusy(false)}
  }

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Lineage adapters</p><h2 className="mt-1 text-2xl font-black">Execution and transformation lineage</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Normalize lineage from systems used for profiling and transformation. Persist source-to-target edges together with underlying SQL, M, DAX, model logic, operation type and optional column mappings.</p></div><label className="min-w-64 text-sm font-semibold">Project<select value={projectId} onChange={event=>setProjectId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><div className="mt-5 flex flex-wrap gap-2">{supported.map(item=><button type="button" key={item} onClick={()=>choosePreset(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${preset===item?'bg-violet-600 text-white':'bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700'}`}>{item.replaceAll('_',' ')}</button>)}</div></section>

    <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <form onSubmit={event=>void submit(event)} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Network className="h-5 w-5 text-violet-600"/><h3 className="text-lg font-bold">Ingest lineage payload</h3></div><p className="mt-2 text-sm text-slate-500">Use the presets as connector contracts or send equivalent payloads programmatically. Stable event IDs make retries idempotent.</p><textarea value={payload} onChange={event=>setPayload(event.target.value)} rows={22} className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"/><button disabled={busy||!projectId} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}Ingest lineage</button>{message?<p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>:null}{error?<p className="mt-3 text-sm font-semibold text-red-600">{error}</p>:null}</form>

      <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><Metric label="Integrations" value={state.integrations.length}/><Metric label="External assets" value={state.assets.length}/><Metric label="Transformations" value={state.transformations.length}/><Metric label="Recent events" value={state.events.length}/></div><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-violet-600"/><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent transformations</p></div><div className="mt-4 space-y-2">{state.transformations.slice(0,10).map(row=><div key={String(row.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="truncate font-bold">{String(row.name??row.external_id??'Transformation')}</span><span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">{String(row.operation??'TRANSFORM')}</span></div><p className="mt-1 truncate text-slate-400">{String(row.source_system??'')} · {String(row.logic_hash??'').slice(0,16)}</p></div>)}</div></article><article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent ingestion events</p><div className="mt-4 space-y-2">{state.events.slice(0,12).map(row=><div key={String(row.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-bold">{String(row.job_name??row.event_type??'Lineage event')}</span><span>{String(row.edge_count??0)} edges · {String(row.transformation_count??0)} transforms</span></div><p className="mt-1 truncate text-slate-400">{String(row.external_event_id??'')}</p></div>)}</div></article></div>
    </section>
  </div>
}
function Metric({label,value}:{label:string;value:number}){return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></article>}
