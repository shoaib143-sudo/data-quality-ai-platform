import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, Database, Gauge, Tag, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  GovernedEmptyState,
  GovernedEvidenceTile,
  GovernedMetricCard,
  GovernedSection,
  governedPresentationClasses,
} from '@/components/governance/governed-presentation-registry'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { buildDatasetPresentationPlan, type DatasetMetricKey, type DatasetSectionKey } from '@/lib/governance/persona-dataset-presentation'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { canonicalRoutes } from '@/lib/platform/canonical-routes'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function pct(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A'
}

const { surface, inset, focus, interactive } = governedPresentationClasses

export default async function GovernedDatasetPage({params}:{params:Promise<{datasetId:string}>}){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const presentation=buildDatasetPresentationPlan(landing.persona)
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
  const hasAccountability=Boolean(catalog?.business_owner_user_id||catalog?.steward_user_id)

  const metricRegistry:Record<DatasetMetricKey,ReactNode>={
    quality:<GovernedMetricCard href={canProfiling?profilingHref:undefined} icon={<Gauge className="h-5 w-5"/>} value={pct(score?.overall_score)} label="Data quality" detail="Latest scored profiling evidence"/>,
    issues:<GovernedMetricCard href={canIssues?'/issues':undefined} icon={<ArrowRight className="h-5 w-5"/>} value={String(openIssues.length)} label="Open governed issues" detail="Unresolved issues linked to this dataset"/>,
    accountability:<GovernedMetricCard href={canStewardship?'/stewardship':undefined} icon={<Users className="h-5 w-5"/>} value={hasAccountability?'Assigned':'Missing'} label="Accountability" detail="Governed ownership and stewardship"/>,
    classification:<GovernedMetricCard href={canClassification?'/classification':undefined} icon={<Tag className="h-5 w-5"/>} value={String(approvedClassifications)} label="Approved classifications" detail="Governed classification evidence"/>,
    glossary:<GovernedMetricCard href={canGlossary?'/glossary':undefined} icon={<BookOpen className="h-5 w-5"/>} value={String(approvedGlossary)} label="Glossary mappings" detail="Approved business meaning connected to data"/>,
    'critical-data':<GovernedMetricCard href={canClassification?'/classification':undefined} icon={<Database className="h-5 w-5"/>} value={String(cdeCount)} label="Critical data mappings" detail="Governed CDE mappings for this dataset"/>,
  }

  const qualitySection=<GovernedSection title={presentation.qualityTitle} action={canProfiling&&run?<Link href={profilingHref} className={`text-xs font-bold text-blue-300 ${focus}`}>Open full evidence</Link>:null}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Completeness" value={pct(score?.completeness_score)} detail="Latest scored evidence"/>
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Validity" value={pct(score?.validity_score)} detail="Latest scored evidence"/>
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Accuracy" value={pct(score?.accuracy_score)} detail="Latest scored evidence"/>
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Uniqueness" value={pct(score?.uniqueness_score)} detail="Latest scored evidence"/>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Latest version" value={version?`v${version.version_number}`:'N/A'} detail="Current catalog version"/>
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Rows / columns" value={run?`${run.row_count??'N/A'} / ${run.column_count??'N/A'}`:'N/A'} detail="Latest profile observation"/>
      <GovernedEvidenceTile href={canProfiling?profilingHref:undefined} label="Profile status" value={run?.status??'NOT_PROFILED'} detail={run?.completed_at?'Latest run completed with persisted evidence':'Current profiling lifecycle state'}/>
    </div>
  </GovernedSection>

  const issuesSection=<GovernedSection title={presentation.issueTitle} action={canIssues?<Link href="/issues" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link>:null}>
    <div className="space-y-2">{openIssues.slice(0,6).map(issue=>{const issueHref=canProfiling&&issue.profile_run_id?`/profiling/explorer?runId=${encodeURIComponent(issue.profile_run_id)}${issue.finding_id?`&findingId=${encodeURIComponent(issue.finding_id)}`:''}`:canIssues?'/issues':datasetHref;return <Link key={issue.id} href={issueHref} className={`${inset} ${interactive} flex items-start gap-3 p-4`}><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{issue.severity}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{issue.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{issue.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-500"/></Link>})}{openIssues.length===0?<GovernedEmptyState>No unresolved governed issues are linked to this dataset.</GovernedEmptyState>:null}</div>
  </GovernedSection>

  const findingsSection=<GovernedSection eyebrow="Latest profiling findings" title={presentation.findingsTitle} action={canProfiling&&run?<Link href={profilingHref} className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link>:null}>
    <div className="grid gap-3 md:grid-cols-2">{findings.map(finding=>canProfiling?<Link key={finding.id} href={run?`/profiling/explorer?runId=${encodeURIComponent(run.id)}&findingId=${encodeURIComponent(finding.id)}`:profilingHref} className={`${inset} ${interactive} p-4`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{finding.title}</span><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{finding.description}</p><p className="mt-3 text-xs font-bold text-blue-300">Open evidence →</p></Link>:<div key={finding.id} className={`${inset} p-4`}><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{finding.title}</span><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{finding.severity}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{finding.description}</p></div>)}{findings.length===0?<GovernedEmptyState>No profiling findings are available for the latest profile.</GovernedEmptyState>:null}</div>
  </GovernedSection>

  const governanceSection=<GovernedSection title="Governance context">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GovernedEvidenceTile href={canGlossary?'/glossary':undefined} label="Glossary mappings" value={String(approvedGlossary)} detail="Approved business semantics"/>
      <GovernedEvidenceTile href={canClassification?'/classification':undefined} label="Classifications" value={String(approvedClassifications)} detail="Approved classification evidence"/>
      <GovernedEvidenceTile href={canStewardship?'/stewardship':undefined} label="Accountability" value={hasAccountability?'Assigned':'Missing'} detail="Owner or steward assignment"/>
      <GovernedEvidenceTile href={canClassification?'/classification':undefined} label="Critical data mappings" value={String(cdeCount)} detail="Governed CDE evidence"/>
    </div>
  </GovernedSection>

  const sectionRegistry:Record<DatasetSectionKey,ReactNode>={quality:qualitySection,issues:issuesSection,findings:findingsSection,governance:governanceSection}

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
    <nav className={`${surface} flex flex-wrap items-center justify-between gap-3 px-5 py-3`}><Link href="/catalog" className={`inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white ${focus}`}><ArrowLeft className="h-4 w-4"/>Data Catalog</Link><div className="flex flex-wrap gap-2">{canProfiling&&run?<Link href={profilingHref} className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Profiling evidence</Link>:null}{canLineage?<Link href="/lineage" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Lineage</Link>:null}{canIssues?<Link href="/issues" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Issues</Link>:null}</div></nav>

    <header className={`${surface} mt-5 p-6 sm:p-7`}><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-4xl"><div className="flex flex-wrap items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Database className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">{presentation.lensLabel}</p><h1 className="mt-1 text-3xl font-black text-white">{dataset.name}</h1></div></div><p className="mt-4 text-base font-bold text-slate-200">{presentation.primaryQuestion}</p><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{catalog?.business_description||dataset.description||'No governed business description is available yet.'}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-blue-400/10 px-2.5 py-1.5 font-bold text-blue-300">{catalog?.certification_status||'UNCERTIFIED'}</span><span className="rounded-lg bg-amber-400/10 px-2.5 py-1.5 font-bold text-amber-300">{catalog?.criticality||'UNSET'} criticality</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-slate-400">{dataset.business_domain||'Unassigned domain'}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-slate-400">{dataset.status}</span></div><p className="mt-4 text-[11px] text-slate-600">Persona-aware presentation only. Governed evidence, policy and authorization are unchanged.</p></div><Link href={`/ai-insights?projectId=${encodeURIComponent(dataset.project_id)}&datasetId=${encodeURIComponent(dataset.id)}&prompt=${encodeURIComponent(`Explain the current trust, risks and governed evidence for ${dataset.name} for a ${presentation.lensLabel.toLowerCase()}`)}`} className={`rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-bold text-white ${focus}`}>Ask DataNexus AI <ArrowRight className="ml-1 inline h-4 w-4"/></Link></div></header>

    <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{presentation.metricOrder.map(key=><div key={key}>{metricRegistry[key]}</div>)}</section>

    <div className="mt-5 space-y-5">{presentation.sectionOrder.map(key=><div key={key}>{sectionRegistry[key]}</div>)}</div>

    <footer className={`${surface} mt-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-slate-600`}><span>{presentation.objective}</span><span>{presentation.truthBoundary} · {presentation.authorizationBoundary}</span></footer>
  </div></main>
}
