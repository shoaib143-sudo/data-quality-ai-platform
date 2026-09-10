import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, Database, Gauge, Tag, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function pct(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A' }

const surface='rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]'
const inset='rounded-2xl border border-white/[0.07] bg-[#08182b]'
const focus='focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive=`${focus} transition hover:-translate-y-0.5 hover:border-cyan-400/30 active:translate-y-0`

function MetricTile({href,icon,value,label,detail}:{href?:string;icon:ReactNode;value:string;label:string;detail:string}){
  const content=<><span className="text-cyan-300">{icon}</span><p className="mt-3 text-3xl font-black text-white">{value}</p><p className="text-sm font-bold text-slate-200">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></>
  return href?<Link href={href} className={`${surface} ${interactive} block p-5`}>{content}</Link>:<div className={`${surface} p-5`}>{content}</div>
}

export default async function GovernedDatasetPage({params}:{params:Promise<{datasetId:string}>}){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const {datasetId}=await params
  const supabase=await createClient()

  const canGlossary=canAccessWorkspace(landing.persona,'glossary',landing.organizationRole)
  const canLineage=canAccessWorkspace(landing.persona,'lineage',landing.organizationRole)
  const canIssues=canAccessWorkspace(landing.persona,'issues',landing.organizationRole)
  const canClassification=canAccessWorkspace(landing.persona,'classification',landing.organizationRole)
  const canStewardship=canAccessWorkspace(landing.persona,'stewardship',landing.organizationRole)
  const canProfiling=canAccessWorkspace(landing.persona,'profiling',landing.organizationRole)

  const datasetResult=await supabase.schema('catalog').from('datasets').select('id,project_id,name,description,source_identifier,business_domain,status,created_at,updated_at').eq('id',datasetId).maybeSingle()
  if(datasetResult.error)throw new Error(`Unable to load dataset: ${datasetResult.error.message}`)
  if(!datasetResult.data)notFound()
  const dataset=datasetResult.data

  const [versionResult,catalogResult,classificationsResult,glossaryResult,cdeResult,issuesResult]=await Promise.all([
    supabase.schema('catalog').from('dataset_versions').select('id,version_number,status,row_count,column_count,observed_at,created_at').eq('dataset_id',datasetId).order('version_number',{ascending:false}).limit(1).maybeSingle(),
    supabase.schema('governance').from('dataset_catalog').select('certification_status,criticality,lifecycle_status,business_description,business_owner_user_id,steward_user_id,tags,retention_days').eq('dataset_id',datasetId).maybeSingle(),
    supabase.schema('governance').from('dataset_classifications').select('id,status,label_id,column_name,confidence,authority_state').eq('dataset_id',datasetId),
    supabase.schema('governance').from('glossary_mappings').select('id,approved,mapping_status,column_name,confidence').eq('dataset_id',datasetId),
    supabase.schema('governance').from('cde_mappings').select('id,status,column_name,confidence').eq('dataset_id',datasetId),
    supabase.schema('governance').from('issues').select('id,title,severity,status,description,profile_run_id,finding_id,updated_at').eq('dataset_id',datasetId).order('updated_at',{ascending:false}).limit(12),
  ])
  for(const result of [versionResult,catalogResult,classificationsResult,glossaryResult,cdeResult,issuesResult])if(result.error)throw new Error(`Unable to load governed dataset evidence: ${result.error.message}`)

  const version=versionResult.data
  const catalog=catalogResult.data
  let run:null|{id:string;status:string;row_count:number|null;column_count:number|null;completed_at:string|null}=null
  let score:null|{overall_score:number|null;completeness_score:number|null;uniqueness_score:number|null;validity_score:number|null;accuracy_score:number|null}=null
  let findings:{id:string;severity:string;title:string;description:string;confidence:number|null}[]=[]
  if(version){
    const runResult=await supabase.schema('profiling').from('profile_runs').select('id,status,row_count,column_count,completed_at').eq('dataset_version_id',version.id).order('started_at',{ascending:false}).limit(1).maybeSingle()
    if(runResult.error)throw new Error(`Unable to load latest profile: ${runResult.error.message}`)
    run=runResult.data
    if(run){
      const [scoreResult,findingResult]=await Promise.all([
        supabase.schema('profiling').from('data_quality_scores').select('overall_score,completeness_score,uniqueness_score,validity_score,accuracy_score').eq('profile_run_id',run.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        supabase.schema('profiling').from('profile_findings').select('id,severity,title,description,confidence').eq('profile_run_id',run.id).order('created_at',{ascending:false}).limit(8),
      ])
      if(scoreResult.error)throw new Error(`Unable to load latest quality score: ${scoreResult.error.message}`)
      if(findingResult.error)throw new Error(`Unable to load latest findings: ${findingResult.error.message}`)
      score=scoreResult.data
      findings=findingResult.data??[]
    }
  }

  const approvedClassifications=(classificationsResult.data??[]).filter(row=>['APPROVED','ACCEPTED','CONFIRMED'].includes(String(row.status??'').toUpperCase())||['AUTHORITATIVE','APPROVED','CONFIRMED'].includes(String(row.authority_state??'').toUpperCase())).length
  const approvedGlossary=(glossaryResult.data??[]).filter(row=>row.approved===true||['APPROVED','ACCEPTED','CONFIRMED'].includes(String(row.mapping_status??'').toUpperCase())).length
  const cdeCount=(cdeResult.data??[]).length
  const openIssues=(issuesResult.data??[]).filter(row=>!['RESOLVED','CLOSED','CANCELLED','REJECTED'].includes(String(row.status).toUpperCase()))
  const profilingHref=run?`/profiling/explorer?runId=${encodeURIComponent(run.id)}`:'/profiling/explorer'
  const datasetHref=canonicalRoutes.governedDataset(dataset.id)

  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
    <nav className={`${surface} flex flex-wrap items-center justify-between gap-3 px-5 py-3`}><Link href="/catalog" className={`inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white ${focus}`}><ArrowLeft className="h-4 w-4"/>Data Catalog</Link><div className="flex flex-wrap gap-2">{canProfiling&&run?<Link href={profilingHref} className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Profiling evidence</Link>:null}{canLineage?<Link href="/lineage" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Lineage</Link>:null}{canIssues?<Link href="/issues" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Issues</Link>:null}</div></nav>

    <header className={`${surface} mt-5 p-6 sm:p-7`}><div className="flex flex-wrap items-start justify-between gap-5"><div><div className="flex flex-wrap items-center gap-2"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Database className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Governed dataset</p><h1 className="mt-1 text-3xl font-black text-white">{dataset.name}</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">{catalog?.business_description||dataset.description||'No governed business description is available yet.'}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-blue-400/10 px-2.5 py-1.5 font-bold text-blue-300">{catalog?.certification_status||'UNCERTIFIED'}</span><span className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 font-bold text-amber-300">{catalog?.criticality||'UNSET'} criticality</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-slate-400">{dataset.business_domain||'Unassigned domain'}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-slate-400">{dataset.status}</span></div></div><Link href={`/ai-insights?projectId=${encodeURIComponent(dataset.project_id)}&datasetId=${encodeURIComponent(dataset.id)}&prompt=${encodeURIComponent(`Explain the current trust, risks and governed evidence for ${dataset.name}`)}`} className={`rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-bold text-white ${focus}`}>Ask DataNexus AI <ArrowRight className="ml-1 inline h-4 w-4"/></Link></div></header>

    <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricTile href={canProfiling?profilingHref:undefined} icon={<Gauge className="h-5 w-5"/>} value={pct(score?.overall_score)} label="Data quality" detail="Latest scored profiling evidence"/>
      <MetricTile href={canGlossary?'/glossary':undefined} icon={<BookOpen className="h-5 w-5 text-violet-300"/>} value={String(approvedGlossary)} label="Approved glossary mappings" detail="Business meaning connected to data"/>
      <MetricTile href={canClassification?'/classification':undefined} icon={<Tag className="h-5 w-5 text-amber-300"/>} value={String(approvedClassifications)} label="Approved classifications" detail="Governed classification evidence"/>
      <MetricTile href={canStewardship?'/stewardship':undefined} icon={<Users className="h-5 w-5 text-emerald-300"/>} value={catalog?.business_owner_user_id||catalog?.steward_user_id?'Assigned':'Missing'} label="Accountability" detail="Governed ownership and stewardship"/>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black text-white">Current quality evidence</h2>{canProfiling&&run?<Link href={profilingHref} className={`text-xs font-bold text-blue-300 ${focus}`}>Open full evidence</Link>:null}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Completeness',score?.completeness_score],['Validity',score?.validity_score],['Accuracy',score?.accuracy_score],['Uniqueness',score?.uniqueness_score]].map(([label,value])=>canProfiling?<Link key={String(label)} href={profilingHref} className={`${inset} ${interactive} p-4`}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{typeof value==='number'?pct(value):'N/A'}</p></Link>:<div key={String(label)} className={`${inset} p-4`}><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{typeof value==='number'?pct(value):'N/A'}</p></div>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{canProfiling?<Link href={profilingHref} className={`${inset} ${interactive} p-4`}><p className="text-xs text-slate-500">Latest version</p><p className="mt-1 font-black text-slate-200">{version?`v${version.version_number}`:'N/A'}</p></Link>:<div className={`${inset} p-4`}><p className="text-xs text-slate-500">Latest version</p><p className="mt-1 font-black text-slate-200">{version?`v${version.version_number}`:'N/A'}</p></div>}{canProfiling?<Link href={profilingHref} className={`${inset} ${interactive} p-4`}><p className="text-xs text-slate-500">Rows / columns</p><p className="mt-1 font-black text-slate-200">{run?`${run.row_count??'N/A'} / ${run.column_count??'N/A'}`:'N/A'}</p></Link>:<div className={`${inset} p-4`}><p className="text-xs text-slate-500">Rows / columns</p><p className="mt-1 font-black text-slate-200">{run?`${run.row_count??'N/A'} / ${run.column_count??'N/A'}`:'N/A'}</p></div>}{canClassification?<Link href="/classification" className={`${inset} ${interactive} p-4`}><p className="text-xs text-slate-500">Critical data mappings</p><p className="mt-1 font-black text-slate-200">{cdeCount}</p></Link>:<div className={`${inset} p-4`}><p className="text-xs text-slate-500">Critical data mappings</p><p className="mt-1 font-black text-slate-200">{cdeCount}</p></div>}</div></article>

      <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black text-white">Open governed issues</h2>{canIssues?<Link href="/issues" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link>:null}</div><div className="mt-4 space-y-2">{openIssues.slice(0,6).map(issue=>{const issueHref=canProfiling&&issue.profile_run_id?`/profiling/explorer?runId=${encodeURIComponent(issue.profile_run_id)}${issue.finding_id?`&findingId=${encodeURIComponent(issue.finding_id)}`:''}`:canIssues?'/issues':datasetHref;return <Link key={issue.id} href={issueHref} className={`${inset} ${interactive} flex items-start gap-3 p-4`}><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{issue.severity}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{issue.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{issue.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-500"/></Link>})}{openIssues.length===0?<p className={`${inset} p-5 text-sm text-slate-500`}>No unresolved governed issues are linked to this dataset.</p>:null}</div></article>
    </section>

    <section className={`${surface} mt-5 p-5`}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Latest profiling findings</p><h2 className="mt-1 text-xl font-black text-white">Evidence requiring attention</h2></div>{canProfiling&&run?<Link href={profilingHref} className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link>:null}</div><div className="mt-4 grid gap-3 md:grid-cols-2">{findings.map(finding=>canProfiling?<Link key={finding.id} href={run?`/profiling/explorer?runId=${encodeURIComponent(run.id)}&findingId=${encodeURIComponent(finding.id)}`:profilingHref} className={`${inset} ${interactive} p-4`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{finding.title}</span><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{finding.description}</p><p className="mt-3 text-xs font-bold text-blue-300">Open evidence →</p></Link>:<div key={finding.id} className={`${inset} p-4`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{finding.title}</span><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{finding.description}</p></div>)}{findings.length===0?<p className="text-sm text-slate-500">No findings are available for the latest profile.</p>:null}</div></section>
  </div></main>
}