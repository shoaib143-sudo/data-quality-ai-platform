import Link from 'next/link'
import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, Clock3, GitBranch, Link2, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Incident = {
  id: string
  project_id: string
  dataset_id: string
  status: string
  severity: string
  title: string
  summary: string
  probable_root_causes: Array<Record<string, unknown>>
  business_impact: string | null
  risk: Record<string, unknown>
  recommendations: Array<Record<string, unknown>>
  confidence: number | null
  approval_required: boolean
  workflow_instance_id: string | null
  evidence: Record<string, unknown>
  last_observed_at: string
  response_due_at: string | null
  escalation_level: number
  last_escalated_at: string | null
}
type Impact = { incident_id: string; asset_type: string; asset_id: string | null; asset_name: string | null; distance: number; risk_score: number; confidence: number | null }
type Correlation = { id:string;incident_a_id:string;incident_b_id:string;correlation_type:string;status:string;score:number;confidence:number;evidence:Record<string,unknown> }
type Dataset = { id: string; name: string }

function text(value: unknown) { return typeof value === 'string' ? value : '' }
function number(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0 }
function tone(value:string){const x=value.toUpperCase();if(x==='CRITICAL'||x==='HIGH'||x.includes('ERROR'))return'border-red-200 bg-red-50 text-red-700';if(x==='MEDIUM'||x==='INVESTIGATING'||x==='MITIGATING')return'border-amber-200 bg-amber-50 text-amber-700';if(x==='RESOLVED')return'border-emerald-200 bg-emerald-50 text-emerald-700';return'border-slate-200 bg-slate-50 text-slate-600'}
function slaState(incident:Incident,now:number){if(incident.status==='RESOLVED'||!incident.response_due_at)return null;const due=new Date(incident.response_due_at).getTime();const minutes=Math.round((due-now)/60000);return{overdue:minutes<0,minutes:Math.abs(minutes),due}}

export default async function IncidentsPage(){
  await requireUser()
  const supabase=await createClient()
  const {data:incidents,error:incidentError}=await supabase.schema('governance').from('observability_incidents').select('*').order('last_observed_at',{ascending:false}).limit(100)
  if(incidentError)throw new Error(incidentError.message)
  const typed=(incidents??[]) as Incident[]
  const now=Date.now()
  const ids=typed.map(row=>row.id)
  const incidentIdSet=new Set(ids)
  const datasetIds=[...new Set(typed.map(row=>row.dataset_id))]
  const [impactResult,datasetResult,correlationResult]=await Promise.all([
    ids.length?supabase.schema('governance').from('observability_incident_impacts').select('incident_id,asset_type,asset_id,asset_name,distance,risk_score,confidence').in('incident_id',ids).order('risk_score',{ascending:false}):Promise.resolve({data:[],error:null}),
    datasetIds.length?supabase.schema('catalog').from('datasets').select('id,name').in('id',datasetIds):Promise.resolve({data:[],error:null}),
    ids.length?supabase.schema('governance').from('observability_incident_correlations').select('id,incident_a_id,incident_b_id,correlation_type,status,score,confidence,evidence').eq('status','ACTIVE').order('score',{ascending:false}).limit(500):Promise.resolve({data:[],error:null}),
  ])
  if(impactResult.error)throw new Error(impactResult.error.message)
  if(datasetResult.error)throw new Error(datasetResult.error.message)
  if(correlationResult.error)throw new Error(correlationResult.error.message)
  const datasetById=new Map((datasetResult.data??[]).map(row=>[row.id,row as Dataset]))
  const incidentById=new Map(typed.map(row=>[row.id,row]))
  const impactsByIncident=new Map<string,Impact[]>()
  for(const impact of (impactResult.data??[]) as Impact[])impactsByIncident.set(impact.incident_id,[...(impactsByIncident.get(impact.incident_id)??[]),impact])
  const correlationsByIncident=new Map<string,Correlation[]>()
  const relevantCorrelations=((correlationResult.data??[]) as Correlation[]).filter(row=>incidentIdSet.has(row.incident_a_id)||incidentIdSet.has(row.incident_b_id))
  for(const correlation of relevantCorrelations){for(const incidentId of [correlation.incident_a_id,correlation.incident_b_id]){if(!incidentIdSet.has(incidentId))continue;correlationsByIncident.set(incidentId,[...(correlationsByIncident.get(incidentId)??[]),correlation])}}
  const open=typed.filter(row=>row.status!=='RESOLVED')
  const critical=open.filter(row=>['HIGH','CRITICAL'].includes(row.severity)).length
  const blastRadius=[...impactsByIncident.values()].flat().length
  const overdue=open.filter(row=>slaState(row,now)?.overdue).length

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/observability" className="font-bold text-blue-700">← Observability</Link><div className="flex gap-2"><Link href="/lineage/impact" className="rounded-xl border px-3 py-2 text-sm font-semibold">Impact analysis</Link><Link href="/workflows" className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Response approvals</Link></div></nav>
    <section className="mt-6 rounded-3xl border border-indigo-100 bg-white p-7 shadow-sm"><div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"><BrainCircuit className="h-4 w-4"/>AI Operations Center</div><h1 className="mt-4 text-3xl font-black">Correlated operational incidents with governed response</h1><p className="mt-3 max-w-4xl text-slate-600">Freshness, schema, volume, profiling and Data Quality signals are correlated into incidents, then related across datasets using shared failure modes, time proximity and persisted lineage. Response SLAs escalate overdue incidents through the existing durable notification routes, while critical response decisions remain approval-gated.</p></section>
    <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-blue-700"><Activity className="h-4 w-4"/>Active incidents</div><p className="mt-2 text-3xl font-black">{open.length}</p></div><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-red-700"><AlertTriangle className="h-4 w-4"/>High or critical</div><p className="mt-2 text-3xl font-black">{critical}</p></div><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-red-700"><Clock3 className="h-4 w-4"/>Overdue SLA</div><p className="mt-2 text-3xl font-black">{overdue}</p></div><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-violet-700"><GitBranch className="h-4 w-4"/>Downstream impact</div><p className="mt-2 text-3xl font-black">{blastRadius}</p></div><div className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><Link2 className="h-4 w-4"/>Cross-dataset links</div><p className="mt-2 text-3xl font-black">{relevantCorrelations.length}</p></div></section>
    <section className="mt-6 space-y-4">{typed.length?typed.map(incident=>{const causes=Array.isArray(incident.probable_root_causes)?incident.probable_root_causes:[];const recommendations=Array.isArray(incident.recommendations)?incident.recommendations:[];const impacts=(impactsByIncident.get(incident.id)??[]).slice(0,8);const correlations=(correlationsByIncident.get(incident.id)??[]).slice(0,6);const sla=slaState(incident,now);return <article key={incident.id} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{datasetById.get(incident.dataset_id)?.name??incident.dataset_id.slice(0,8)}</p><h2 className="mt-1 text-xl font-bold">{incident.title}</h2><p className="mt-2 max-w-4xl text-sm text-slate-600">{incident.summary}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(incident.severity)}`}>{incident.severity}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(incident.status)}`}>{incident.status}</span>{sla?<span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${sla.overdue?'border-red-200 bg-red-50 text-red-700':'border-blue-200 bg-blue-50 text-blue-700'}`}>{sla.overdue?`${sla.minutes}m overdue`:`${sla.minutes}m to SLA`}</span>:null}{incident.escalation_level>0?<span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">Escalation L{incident.escalation_level}</span>:null}</div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Probable causes</p><div className="mt-2 space-y-2">{causes.map((cause,index)=><div key={index} className="text-sm"><span className="font-semibold">{text(cause.cause)}</span><span className="ml-2 text-xs text-slate-500">{Math.round(number(cause.confidence)*100)}%</span></div>)}</div></div><div className="rounded-2xl bg-blue-50/60 p-4"><p className="text-xs font-bold uppercase text-blue-700">Recommended response</p><div className="mt-2 space-y-2">{recommendations.slice(0,5).map((recommendation,index)=><div key={index} className="text-sm"><span className="font-mono font-semibold">{text(recommendation.action)}</span>{recommendation.approval_required===true?<span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">approval</span>:null}</div>)}</div></div><div className="rounded-2xl bg-violet-50/60 p-4"><p className="text-xs font-bold uppercase text-violet-700">Downstream blast radius</p>{impacts.length?<div className="mt-2 space-y-2">{impacts.map((impact,index)=><div key={`${impact.asset_type}:${impact.asset_id}:${index}`} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{impact.asset_name??`${impact.asset_type}:${impact.asset_id?.slice(0,8)}`}</span><span className="whitespace-nowrap text-xs font-bold text-violet-700">{Math.round(Number(impact.risk_score)*100)}% risk · {impact.distance} hop</span></div>)}</div>:<p className="mt-2 text-sm text-slate-500">No downstream dependencies discovered.</p>}</div></div>
      {correlations.length?<div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase text-indigo-700"><Link2 className="h-4 w-4"/>Related incidents across datasets</div><div className="mt-3 grid gap-2 md:grid-cols-2">{correlations.map(correlation=>{const peerId=correlation.incident_a_id===incident.id?correlation.incident_b_id:correlation.incident_a_id;const peer=incidentById.get(peerId);return <div key={correlation.id} className="rounded-xl bg-white p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{peer?datasetById.get(peer.dataset_id)?.name??peer.dataset_id.slice(0,8):peerId.slice(0,8)}</p><p className="mt-1 text-xs text-slate-500">{correlation.correlation_type.replaceAll('_',' ')}</p></div><span className="text-xs font-black text-indigo-700">{Math.round(Number(correlation.score)*100)}%</span></div></div>})}</div></div>:null}
      {incident.business_impact?<p className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4 text-sm text-slate-700"><strong>Business impact:</strong> {incident.business_impact}</p>:null}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">{incident.approval_required?<><ShieldCheck className="h-4 w-4 text-amber-600"/><span className="font-semibold text-amber-700">Governed approval required</span><Link href="/workflows" className="font-bold text-violet-700">Open workflow →</Link></>:<><CheckCircle2 className="h-4 w-4 text-emerald-600"/><span className="text-slate-500">No critical response approval required</span></>}<span className="ml-auto text-xs text-slate-400">{incident.response_due_at?`Due ${new Date(incident.response_due_at).toLocaleString()} · `:''}Confidence {incident.confidence===null?'n/a':`${Math.round(incident.confidence*100)}%`}</span></div>
    </article>}):<div className="rounded-3xl border border-dashed bg-white p-10 text-center text-slate-500">No correlated incidents yet. Future observability evaluations populate this Operations Center automatically.</div>}</section>
  </div></main>
}
