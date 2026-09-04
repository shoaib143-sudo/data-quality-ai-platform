'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookMarked,
  Braces,
  CheckCircle2,
  CircleUserRound,
  Database,
  Filter,
  GitBranch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'

type OverlayKey = 'dq'|'terms'|'stakeholders'|'classification'|'certification'|'contracts'|'issues'|'observability'|'profiling'|'transformation'

type Finding = { severity:string; title:string }
type Term = { term:string; definition:string|null; domain:string|null; confidence:number|null; approved:boolean }
type Stakeholder = { role:string; accountability:string|null; userId:string }
type Classification = { code:string; name:string; category:string|null; status:string; confidence:number|null }
type Certification = { status:string; requestedAt:string|null; decidedAt:string|null } | null
type Contract = { name:string; status:string; version:number|null; critical:boolean }
type Issue = { severity:string; status:string; title:string }
type Observability = { severity:string; status:string; category:string; title:string }

export type LineageField = {
  key:string
  projectId:string|null
  datasetId:string|null
  datasetName:string
  assetName:string
  columnName:string
  dqScore:number|null
  datasetDqScore:number|null
  dqMethod:string|null
  profileRunId:string|null
  profiledAt:string|null
  inferredType:string|null
  semanticType:string|null
  nullable:boolean|null
  candidateKey:boolean
  completeness:number|null
  uniqueness:number|null
  distinctPercentage:number|null
  findings:Finding[]
  terms:Term[]
  stakeholders:Stakeholder[]
  classifications:Classification[]
  certification:Certification
  contracts:Contract[]
  issues:Issue[]
  observability:Observability[]
}

export type FieldMapping = {
  id:string
  sourceFieldKey:string
  targetFieldKey:string
  operation:string|null
  expression:string|null
  transformationName:string|null
  sourceSystem:string|null
  logicLanguage:string|null
}

export type DatasetEdge = {
  id:string
  sourceLabel:string
  sourceType:string
  targetLabel:string
  targetType:string
  relationship:string
  transformationName:string|null
}

type Props = {
  fields:LineageField[]
  mappings:FieldMapping[]
  edges:DatasetEdge[]
  stats:{ edges:number; datasets:number; assets:number; transformations:number; mappedColumns:number }
}

const overlayOptions:Array<{key:OverlayKey;label:string;icon:typeof Sparkles}> = [
  {key:'dq',label:'Data Quality',icon:Activity},
  {key:'terms',label:'Business Terms',icon:BookMarked},
  {key:'stakeholders',label:'Stakeholders',icon:CircleUserRound},
  {key:'classification',label:'Classification',icon:ShieldCheck},
  {key:'certification',label:'Certification',icon:BadgeCheck},
  {key:'contracts',label:'Data Contracts',icon:Braces},
  {key:'issues',label:'Issues',icon:AlertTriangle},
  {key:'observability',label:'Observability',icon:Sparkles},
  {key:'profiling',label:'Profiling',icon:Database},
  {key:'transformation',label:'Transformation Logic',icon:GitBranch},
]

const pct=(value:number|null)=>value===null?'N/A':`${Math.round(value*100)}%`
const shortId=(value:string)=>value.slice(0,8)
const severityWeight=(severity:string)=>({CRITICAL:4,HIGH:3,MEDIUM:2,LOW:1}[severity.toUpperCase()]??0)
const hasGovernance=(field:LineageField)=>Boolean(field.terms.length||field.classifications.length||field.stakeholders.length||field.certification||field.contracts.length||field.issues.length||field.observability.length)

function scoreClass(score:number|null){
  if(score===null)return 'border-slate-200 bg-slate-50 text-slate-600'
  if(score>=90)return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if(score>=75)return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-red-200 bg-red-50 text-red-700'
}

function statusClass(status:string){
  const normalized=status.toUpperCase()
  if(['APPROVED','CERTIFIED','ACTIVE','PASSED','RESOLVED'].includes(normalized))return 'bg-emerald-50 text-emerald-700'
  if(['REJECTED','FAILED','CRITICAL','OPEN'].includes(normalized))return 'bg-red-50 text-red-700'
  return 'bg-amber-50 text-amber-700'
}

export function LineageExplorer({fields,mappings,edges,stats}:Props){
  const [activeOverlays,setActiveOverlays]=useState<OverlayKey[]>(['dq','terms','stakeholders'])
  const [selectedKey,setSelectedKey]=useState<string|null>(null)
  const [search,setSearch]=useState('')
  const [lowQualityOnly,setLowQualityOnly]=useState(false)
  const [governedOnly,setGovernedOnly]=useState(false)
  const fieldByKey=useMemo(()=>new Map(fields.map(field=>[field.key,field])),[fields])
  const selected=selectedKey?fieldByKey.get(selectedKey)??null:null

  const visibleFields=useMemo(()=>{
    const query=search.trim().toLowerCase()
    return fields.filter(field=>{
      if(query){
        const haystack=[
          field.datasetName,field.assetName,field.columnName,field.inferredType,field.semanticType,
          ...field.terms.flatMap(term=>[term.term,term.domain,term.definition]),
          ...field.stakeholders.flatMap(item=>[item.role,item.accountability]),
          ...field.classifications.flatMap(item=>[item.code,item.name,item.category]),
          ...field.contracts.map(item=>item.name),
          ...field.issues.map(item=>item.title),
          ...field.observability.flatMap(item=>[item.category,item.title]),
        ].filter(Boolean).join(' ').toLowerCase()
        if(!haystack.includes(query))return false
      }
      if(lowQualityOnly&&!(field.dqScore!==null&&field.dqScore<80))return false
      if(governedOnly&&!hasGovernance(field))return false
      return true
    }).sort((a,b)=>a.datasetName.localeCompare(b.datasetName)||a.columnName.localeCompare(b.columnName))
  },[fields,search,lowQualityOnly,governedOnly])

  const visibleMappings=useMemo(()=>{
    const query=search.trim().toLowerCase()
    return mappings.filter(mapping=>{
      const source=fieldByKey.get(mapping.sourceFieldKey)
      const target=fieldByKey.get(mapping.targetFieldKey)
      if(!source||!target)return false
      if(query){
        const haystack=[source.datasetName,source.assetName,source.columnName,target.datasetName,target.assetName,target.columnName,mapping.operation,mapping.transformationName,mapping.expression].filter(Boolean).join(' ').toLowerCase()
        if(!haystack.includes(query))return false
      }
      if(lowQualityOnly&&!([source,target].some(field=>field.dqScore!==null&&field.dqScore<80)))return false
      if(governedOnly&&!([source,target].some(hasGovernance)))return false
      return true
    })
  },[mappings,fieldByKey,search,lowQualityOnly,governedOnly])

  function toggleOverlay(key:OverlayKey){
    setActiveOverlays(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key])
  }

  return <>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Edges" value={stats.edges}/><Stat label="Datasets" value={stats.datasets}/><Stat label="Field nodes" value={fields.length}/><Stat label="Transformations" value={stats.transformations}/><Stat label="Mapped fields" value={stats.mappedColumns}/>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700"><SlidersHorizontal className="h-4 w-4"/>Governance overlays</div><h2 className="mt-2 text-xl font-black">Choose what governance context appears on lineage fields</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Combine field lineage with quality, meaning, ownership and control evidence without leaving this screen.</p></div>
        <div className="flex flex-wrap gap-2">{overlayOptions.map(option=>{const Icon=option.icon;const active=activeOverlays.includes(option.key);return <button key={option.key} type="button" onClick={()=>toggleOverlay(option.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${active?'border-violet-300 bg-violet-50 text-violet-700':'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}><Icon className="h-3.5 w-3.5"/>{option.label}{active?<CheckCircle2 className="h-3.5 w-3.5"/>:null}</button>})}</div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
        <div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search dataset, field, term or transformation" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-300"/></div>
        <button type="button" onClick={()=>setLowQualityOnly(value=>!value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${lowQualityOnly?'border-red-300 bg-red-50 text-red-700':'border-slate-200 text-slate-600'}`}><Filter className="h-4 w-4"/>DQ &lt; 80</button>
        <button type="button" onClick={()=>setGovernedOnly(value=>!value)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${governedOnly?'border-violet-300 bg-violet-50 text-violet-700':'border-slate-200 text-slate-600'}`}>Governed fields only</button>
        <span className="text-xs font-semibold text-slate-400">{visibleMappings.length} mappings · {visibleFields.length} fields visible</span>
      </div>
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Field lineage explorer</h2><p className="mt-1 text-sm text-slate-500">Select any field to inspect its complete governance context.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Field level</span></div>

        {visibleMappings.length?<div className="mt-5 space-y-4">{visibleMappings.map(mapping=>{
          const source=fieldByKey.get(mapping.sourceFieldKey)!
          const target=fieldByKey.get(mapping.targetFieldKey)!
          return <article key={mapping.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)] lg:items-stretch">
              <FieldCard field={source} overlays={activeOverlays} selected={selectedKey===source.key} onSelect={()=>setSelectedKey(source.key)}/>
              <div className="flex flex-col items-center justify-center rounded-xl border border-violet-100 bg-white p-3 text-center"><ArrowRight className="h-5 w-5 text-violet-500"/><p className="mt-2 text-xs font-black text-slate-700">{mapping.operation??'MAP'}</p>{mapping.transformationName?<p className="mt-1 text-[11px] font-semibold text-violet-600">{mapping.transformationName}</p>:null}{activeOverlays.includes('transformation')&&mapping.expression?<p className="mt-2 line-clamp-4 break-all font-mono text-[10px] leading-4 text-slate-500">{mapping.expression}</p>:null}</div>
              <FieldCard field={target} overlays={activeOverlays} selected={selectedKey===target.key} onSelect={()=>setSelectedKey(target.key)}/>
            </div>
          </article>
        })}</div>:null}

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-slate-800">Profiled lineage fields</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Governance overlays are available from persisted profiling and governance metadata even before column lineage mappings are ingested. Field-to-field arrows are shown only when an explicit persisted column mapping exists.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{visibleFields.length} fields</span></div>
          {visibleFields.length?<div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{visibleFields.slice(0,500).map(field=><FieldCard key={field.key} field={field} overlays={activeOverlays} selected={selectedKey===field.key} onSelect={()=>setSelectedKey(field.key)}/>)}</div>:<div className="mt-4 rounded-xl border border-dashed bg-white p-8 text-center"><Database className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-3 font-bold text-slate-700">No fields match this view</h3><p className="mt-1 text-sm text-slate-500">Adjust the search or filters. Fields appear from the latest completed or partial profiling run.</p></div>}
        </div>

        {!visibleMappings.length?<div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-slate-500"><span className="font-bold text-slate-700">Column lineage status:</span> no explicit source-to-target field mappings are persisted yet. The explorer is intentionally not inferring transformations from matching column names.</div>:null}

        <details className="mt-5 rounded-2xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">Dataset-level lineage fallback · {edges.length} edges</summary><div className="space-y-2 border-t p-4">{edges.slice(0,200).map(edge=><div key={edge.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm md:grid-cols-[1fr_auto_1fr] md:items-center"><div><span className="text-[10px] font-bold uppercase text-blue-500">{edge.sourceType}</span><p className="font-semibold">{edge.sourceLabel}</p></div><div className="flex items-center gap-1 text-xs font-bold text-slate-400">{edge.relationship}<ArrowRight className="h-3.5 w-3.5"/></div><div><span className="text-[10px] font-bold uppercase text-violet-500">{edge.targetType}</span><p className="font-semibold">{edge.targetLabel}</p></div></div>)}</div></details>
      </section>

      <aside className="self-start rounded-3xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-6">
        {selected?<FieldDrawer field={selected} overlays={activeOverlays} onClose={()=>setSelectedKey(null)}/>:<div className="grid min-h-[420px] place-items-center p-8 text-center"><div><Database className="mx-auto h-11 w-11 text-slate-300"/><h3 className="mt-4 text-lg font-black">Field governance context</h3><p className="mt-2 text-sm text-slate-500">Choose any profiled or mapped field to see quality, glossary, stakeholder, classification, contract and operational evidence together.</p></div></div>}
      </aside>
    </div>
  </>
}

function FieldCard({field,overlays,selected,onSelect}:{field:LineageField;overlays:OverlayKey[];selected:boolean;onSelect:()=>void}){
  return <button type="button" onClick={onSelect} className={`w-full rounded-xl border bg-white p-4 text-left transition hover:border-violet-300 hover:shadow-sm ${selected?'border-violet-400 ring-2 ring-violet-100':'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{field.datasetName}</p><p className="mt-1 truncate font-mono text-sm font-black text-slate-900">{field.columnName}</p>{field.assetName!==field.datasetName?<p className="mt-0.5 truncate text-[11px] text-slate-400">{field.assetName}</p>:null}</div>{overlays.includes('dq')?<span className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-black ${scoreClass(field.dqScore)}`}>{field.dqScore===null?'DQ N/A':`DQ ${Math.round(field.dqScore)}`}</span>:null}</div>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {overlays.includes('terms')&&field.terms.slice(0,2).map(term=><Badge key={`term:${term.term}`} text={term.term} tone="blue"/>)}
      {overlays.includes('stakeholders')&&field.stakeholders.slice(0,2).map(item=><Badge key={`stake:${item.role}:${item.userId}`} text={item.role.replaceAll('_',' ')} tone="slate"/>)}
      {overlays.includes('classification')&&field.classifications.slice(0,2).map(item=><Badge key={`class:${item.code}`} text={item.code} tone="purple"/>)}
      {overlays.includes('certification')&&field.certification?<Badge text={field.certification.status} tone={field.certification.status==='APPROVED'?'emerald':'amber'}/>:null}
      {overlays.includes('contracts')&&field.contracts.filter(item=>item.critical).slice(0,1).map(item=><Badge key={`contract:${item.name}`} text="Critical contract field" tone="amber"/>)}
      {overlays.includes('issues')&&field.issues.length?<Badge text={`${field.issues.length} issue${field.issues.length===1?'':'s'}`} tone="red"/>:null}
      {overlays.includes('observability')&&field.observability.length?<Badge text={`${field.observability.length} alert${field.observability.length===1?'':'s'}`} tone="amber"/>:null}
      {overlays.includes('profiling')&&field.completeness!==null?<Badge text={`Complete ${pct(field.completeness)}`} tone="slate"/>:null}
      {!field.terms.length&&!field.stakeholders.length&&!field.classifications.length&&!field.contracts.length&&overlays.some(key=>['terms','stakeholders','classification','contracts'].includes(key))?<span className="text-[10px] text-slate-400">No selected governance metadata</span>:null}
    </div>
  </button>
}

function FieldDrawer({field,overlays,onClose}:{field:LineageField;overlays:OverlayKey[];onClose:()=>void}){
  const sortedFindings=[...field.findings].sort((a,b)=>severityWeight(b.severity)-severityWeight(a.severity))
  return <div>
    <div className="flex items-start justify-between gap-3 border-b p-5"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Governance context</p><h3 className="mt-1 truncate font-mono text-lg font-black">{field.columnName}</h3><p className="truncate text-sm text-slate-500">{field.datasetName}</p></div><button type="button" onClick={onClose} className="rounded-lg border p-2 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4"/></button></div>
    <div className="max-h-[72vh] space-y-5 overflow-y-auto p-5">
      {overlays.includes('dq')?<DrawerSection title="Data Quality" icon={Activity}><div className="grid grid-cols-2 gap-2"><Metric label="Field DQ" value={field.dqScore===null?'N/A':`${Math.round(field.dqScore)}/100`} emphasis/><Metric label="Dataset DQ" value={field.datasetDqScore===null?'N/A':`${Math.round(field.datasetDqScore)}/100`}/><Metric label="Completeness" value={pct(field.completeness)}/><Metric label="Uniqueness" value={pct(field.uniqueness)}/></div>{field.dqMethod?<p className="mt-2 text-[11px] leading-4 text-slate-400">{field.dqMethod}</p>:null}{sortedFindings.length?<div className="mt-3 space-y-2">{sortedFindings.slice(0,5).map((finding,index)=><div key={`${finding.title}:${index}`} className="rounded-lg bg-slate-50 p-2 text-xs"><span className="font-black">{finding.severity}</span> · {finding.title}</div>)}</div>:null}</DrawerSection>:null}
      {overlays.includes('terms')?<DrawerSection title="Business Terms" icon={BookMarked}>{field.terms.length?field.terms.map(term=><div key={term.term} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{term.term}</p>{term.approved?<span className="text-[10px] font-black text-emerald-600">APPROVED</span>:null}</div>{term.domain?<p className="mt-1 text-xs font-semibold text-blue-600">{term.domain}</p>:null}{term.definition?<p className="mt-2 text-xs leading-5 text-slate-500">{term.definition}</p>:null}</div>):<Empty text="No glossary term mapped to this field."/>}</DrawerSection>:null}
      {overlays.includes('stakeholders')?<DrawerSection title="Stakeholders" icon={CircleUserRound}>{field.stakeholders.length?field.stakeholders.map(item=><div key={`${item.role}:${item.userId}`} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><p className="font-bold">{item.role.replaceAll('_',' ')}</p><span className="font-mono text-[10px] text-slate-400">{shortId(item.userId)}</span></div>{item.accountability?<p className="mt-1 text-xs text-slate-500">{item.accountability}</p>:null}</div>):<Empty text="No active stewardship assignment on this dataset."/>}</DrawerSection>:null}
      {overlays.includes('classification')?<DrawerSection title="Classification" icon={ShieldCheck}>{field.classifications.length?field.classifications.map(item=><div key={item.code} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{item.name}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-1 text-xs text-slate-500">{item.code}{item.category?` · ${item.category}`:''}{item.confidence!==null?` · ${Math.round(item.confidence*100)}% confidence`:''}</p></div>):<Empty text="No field or dataset classification assigned."/>}</DrawerSection>:null}
      {overlays.includes('certification')?<DrawerSection title="Certification" icon={BadgeCheck}>{field.certification?<div className="rounded-xl border p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(field.certification.status)}`}>{field.certification.status}</span>{field.certification.decidedAt?<p className="mt-2 text-xs text-slate-500">Decided {new Date(field.certification.decidedAt).toLocaleString()}</p>:null}</div>:<Empty text="No certification request found for this dataset."/>}</DrawerSection>:null}
      {overlays.includes('contracts')?<DrawerSection title="Data Contracts" icon={Braces}>{field.contracts.length?field.contracts.map(item=><div key={item.name} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{item.name}</p>{item.critical?<span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">CRITICAL FIELD</span>:null}</div><p className="mt-1 text-xs text-slate-500">{item.status}{item.version?` · version ${item.version}`:''}</p></div>):<Empty text="No data contract applies to this field."/>}</DrawerSection>:null}
      {overlays.includes('issues')?<DrawerSection title="Issues" icon={AlertTriangle}>{field.issues.length?field.issues.map((item,index)=><div key={`${item.title}:${index}`} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{item.title}</p><span className="text-[10px] font-black text-red-600">{item.severity}</span></div><p className="mt-1 text-xs text-slate-500">{item.status}</p></div>):<Empty text="No linked governance issue on this field."/>}</DrawerSection>:null}
      {overlays.includes('observability')?<DrawerSection title="Observability" icon={Sparkles}>{field.observability.length?field.observability.map((item,index)=><div key={`${item.title}:${index}`} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold">{item.title}</p><span className="text-[10px] font-black text-amber-600">{item.severity}</span></div><p className="mt-1 text-xs text-slate-500">{item.category} · {item.status}</p></div>):<Empty text="No active dataset observability alerts."/>}</DrawerSection>:null}
      {overlays.includes('profiling')?<DrawerSection title="Profiling" icon={Database}><div className="grid grid-cols-2 gap-2"><Metric label="Type" value={field.inferredType??'N/A'}/><Metric label="Semantic type" value={field.semanticType??'N/A'}/><Metric label="Distinct" value={field.distinctPercentage===null?'N/A':`${Math.round(field.distinctPercentage)}%`}/><Metric label="Candidate key" value={field.candidateKey?'Yes':'No'}/></div>{field.profiledAt?<p className="mt-2 text-[11px] text-slate-400">Latest profile {new Date(field.profiledAt).toLocaleString()}</p>:null}</DrawerSection>:null}
    </div>
  </div>
}

function DrawerSection({title,icon:Icon,children}:{title:string;icon:typeof Activity;children:React.ReactNode}){return <section><div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><Icon className="h-4 w-4 text-violet-600"/>{title}</div>{children}</section>}
function Metric({label,value,emphasis=false}:{label:string;value:string;emphasis?:boolean}){return <div className={`rounded-xl border p-3 ${emphasis?'border-violet-200 bg-violet-50':'border-slate-200 bg-slate-50'}`}><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className={`mt-1 font-black ${emphasis?'text-violet-700':'text-slate-800'}`}>{value}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-xl border border-dashed p-3 text-xs text-slate-400">{text}</div>}
function Badge({text,tone}:{text:string;tone:'blue'|'slate'|'purple'|'emerald'|'amber'|'red'}){const classes={blue:'bg-blue-50 text-blue-700',slate:'bg-slate-100 text-slate-600',purple:'bg-purple-50 text-purple-700',emerald:'bg-emerald-50 text-emerald-700',amber:'bg-amber-50 text-amber-700',red:'bg-red-50 text-red-700'};return <span className={`max-w-full truncate rounded-full px-2 py-1 text-[10px] font-bold ${classes[tone]}`}>{text}</span>}
function Stat({label,value}:{label:string;value:number}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>}
