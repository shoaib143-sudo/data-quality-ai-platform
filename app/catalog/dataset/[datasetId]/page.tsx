import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, Database, Gauge, GitBranch, Tag, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { DatasetActions } from '@/app/datasets/dataset-actions'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { DatasetTrustSignals } from '@/components/governance/dataset-trust-signals'
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
  const canJourneys=canAccessWorkspace(landing.persona,'journeys',landing.organizationRole)
  const canContracts=canAccessWorkspace(landing.persona,'contracts',landing.organizationRole)
  const canObservability=canAccessWorkspace(landing.persona,'observability',landing.organizationRole)
  const canAgents=canAccessWorkspace(landing.persona,'agents',landing.organizationRole)

  const datasetResult=await supabase.schema('catalog').from('datasets').select('id,project_id,name,description,source_identifier,business_domain,status,created_at,updated_at').eq('id',datasetId).maybeSingle()
  if(datasetResult.error)throw new Error(`Unable to load dataset: ${datasetResult.error.message}`)
  if(!datasetResult.data)notFound()
  const dataset=datasetResult.data
  const canExecuteProfiling=canProfiling&&await hasProjectCapability(user.id,dataset.project_id,'profiling.execute')

  const empty={data:[],error:null}
  const [versionResult,catalogResult,classificationsResult,glossaryResult,cdeResult,issuesResult,agentDefinitionResult,lineageAssetsResult,contractsResult,alertsResult,agentRunsResult]=await Promise.all([
    supabase.schema('catalog').from('dataset_versions').select('id,version_number,status,row_count,column_count,observed_at,created_at').eq('dataset_id',datasetId).order('version_number',{ascending:false}).limit(8),
    supabase.schema('governance').from('dataset_catalog').select('certification_status,criticality,lifecycle_status,business_description,business_owner_user_id,steward_user_id,tags,retention_days').eq('dataset_id',datasetId).maybeSingle(),
    supabase.schema('governance').from('dataset_classifications').select('id,status,label_id,column_name,confidence,authority_state').eq('dataset_id',datasetId),
    supabase.schema('governance').from('glossary_mappings').select('id,approved,mapping_status,column_name,confidence').eq('dataset_id',datasetId),
    supabase.schema('governance').from('cde_mappings').select('id,status,column_name,confidence').eq('dataset_id',datasetId),
    supabase.schema('governance').from('issues').select('id,title,severity,status,description,profile_run_id,finding_id,updated_at').eq('dataset_id',datasetId).order('updated_at',{ascending:false}).limit(12),
    supabase.schema('agent').from('agent_definitions').select('id').eq('agent_key','profiling_agent').eq('version','2.0').eq('enabled',true).maybeSingle(),
    canLineage?supabase.schema('governance').from('lineage_assets').select('id,name,asset_type').eq('dataset_id',datasetId):Promise.resolve(empty),
    canContracts?supabase.schema('governance').from('data_contracts').select('id,name,status,current_version').eq('dataset_id',datasetId).order('updated_at',{ascending:false}).limit(20):Promise.resolve(empty),
    canObservability?supabase.schema('profiling').from('observability_alerts').select('id,category,severity,status,title').eq('dataset_id',datasetId).order('last_observed_at',{ascending:false}).limit(20):Promise.resolve(empty),
    canAgents?supabase.schema('agent').from('agent_runs').select('id,status,agent_definition_id,created_at,completed_at,error_code').eq('dataset_id',datasetId).order('created_at',{ascending:false}).limit(12):Promise.resolve(empty),
  ])
  for(const result of [versionResult,catalogResult,classificationsResult,glossaryResult,cdeResult,issuesResult,agentDefinitionResult,lineageAssetsResult,contractsResult,alertsResult,agentRunsResult])if(result.error)throw new Error(`Unable to load governed dataset evidence: ${result.error.message}`)

  const recentVersions=versionResult.data??[]
  const version=recentVersions[0]??null
  const catalog=catalogResult.data
  const agentDefinition=agentDefinitionResult.data
  type RecentProfileRun={id:string;status:string;row_count:number|null;column_count:number|null;started_at:string|null;completed_at:string|null}
  let recentRuns:RecentProfileRun[]=[]
  let run:RecentProfileRun|null=null
  let score:null|{overall_score:number|null;completeness_score:number|null;uniqueness_score:number|null;validity_score:number|null;accuracy_score:number|null}=null
  let findings:{id:string;severity:string;title:string;description:string;confidence:number|null}[]=[]
  if(version){
    const runResult=await supabase.schema('profiling').from('profile_runs').select('id,status,row_count,column_count,started_at,completed_at').eq('dataset_version_id',version.id).order('started_at',{ascending:false}).limit(6)
    if(runResult.error)throw new Error(`Unable to load profile history: ${runResult.error.message}`)
    recentRuns=(runResult.data??[]) as RecentProfileRun[]
    run=recentRuns[0]??null
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
  const lineageAssets=lineageAssetsResult.data??[]
  const lineageAssetIds=lineageAssets.map(row=>String(row.id))
  const [sourceEdgesResult,targetEdgesResult,sourceMappingsResult,targetMappingsResult]=lineageAssetIds.length?await Promise.all([
    supabase.schema('governance').from('lineage_edges').select('id').in('source_asset_id',lineageAssetIds),
    supabase.schema('governance').from('lineage_edges').select('id').in('target_asset_id',lineageAssetIds),
    supabase.schema('governance').from('lineage_column_mappings').select('id').in('source_asset_id',lineageAssetIds),
    supabase.schema('governance').from('lineage_column_mappings').select('id').in('target_asset_id',lineageAssetIds),
  ]):[empty,empty,empty,empty]
  for(const result of [sourceEdgesResult,targetEdgesResult,sourceMappingsResult,targetMappingsResult])if(result.error)throw new Error(`Unable to load dataset lineage context: ${result.error.message}`)
  const lineageEdgeCount=new Set([...(sourceEdgesResult.data??[]),...(targetEdgesResult.data??[])].map(row=>String(row.id))).size
  const lineageMappingCount=new Set([...(sourceMappingsResult.data??[]),...(targetMappingsResult.data??[])].map(row=>String(row.id))).size
  const dataContracts=contractsResult.data??[]
  const activeContracts=dataContracts.filter(row=>!['RETIRED','CANCELLED'].includes(String(row.status).toUpperCase()))
  const observabilityAlerts=alertsResult.data??[]
  const openAlerts=observabilityAlerts.filter(row=>!['RESOLVED','CLOSED'].includes(String(row.status).toUpperCase()))
  const agentRuns=agentRunsResult.data??[]
  const successfulAgentRuns=agentRuns.filter(row=>['SUCCEEDED','COMPLETED'].includes(String(row.status).toUpperCase()))
  const lineageHref=`/lineage?q=${encodeURIComponent(dataset.name)}`

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
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Recent profile history</p><span className="text-[11px] text-slate-600">{recentRuns.length} run{recentRuns.length===1?'':'s'} shown</span></div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{recentRuns.map(item=>canProfiling?<Link key={item.id} href={`/profiling/explorer?runId=${encodeURIComponent(item.id)}`} className={`${inset} ${interactive} p-3`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-slate-400">{item.id.slice(0,8)}</span><span className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] font-bold text-slate-300">{item.status}</span></div><p className="mt-2 text-xs text-slate-500">{item.row_count??'N/A'} rows · {item.column_count??'N/A'} columns</p><p className="mt-1 text-[11px] text-slate-600">{item.completed_at?'Completed evidence':'Execution not completed'}</p></Link>:<div key={item.id} className={`${inset} p-3`}><span className="font-mono text-[11px] text-slate-400">{item.id.slice(0,8)}</span><p className="mt-2 text-xs text-slate-500">{item.status}</p></div>)}</div>
      {recentRuns.length===0?<GovernedEmptyState>No profiling history is available for the current dataset version.</GovernedEmptyState>:null}
    </div>
  </GovernedSection>

  const issuesSection=<GovernedSection title={presentation.issueTitle} action={canIssues?<Link href="/issues" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link>:null}>
    <div className="space-y-2">{openIssues.slice(0,6).map(issue=>{const issueHref=canIssues?canonicalRoutes.governedIncident(issue.id):canProfiling&&issue.profile_run_id?`/profiling/explorer?runId=${encodeURIComponent(issue.profile_run_id)}${issue.finding_id?`&findingId=${encodeURIComponent(issue.finding_id)}`:''}`:datasetHref;return <Link key={issue.id} href={issueHref} className={`${inset} ${interactive} flex items-start gap-3 p-4`}><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-black text-rose-300">{issue.severity}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{issue.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{issue.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-500"/></Link>})}{openIssues.length===0?<GovernedEmptyState>No unresolved governed issues are linked to this dataset.</GovernedEmptyState>:null}</div>
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
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Dataset version history</p><span className="text-[11px] text-slate-600">{recentVersions.length} version{recentVersions.length===1?'':'s'} shown</span></div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">{recentVersions.map(item=><div key={item.id} className={`${inset} p-3`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-black text-slate-200">v{item.version_number}</span><span className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] font-bold text-slate-400">{item.status}</span></div><p className="mt-2 text-xs text-slate-500">{item.row_count??'N/A'} rows · {item.column_count??'N/A'} columns</p><p className="mt-1 text-[11px] text-slate-600">{item.observed_at?`Observed ${new Date(item.observed_at).toLocaleString()}`:`Created ${new Date(item.created_at).toLocaleString()}`}</p></div>)}</div>
      {recentVersions.length===0?<GovernedEmptyState>No dataset version history is available.</GovernedEmptyState>:null}
    </div>
  </GovernedSection>

  const connectedContextSection=<GovernedSection eyebrow="Data 360 context" title="Connected governance context">
    <p className="mb-4 max-w-4xl text-sm leading-6 text-slate-500">One dataset view across dependency, control, operational and automation evidence. Counts below are persisted records for this dataset and never inferred from visual proximity.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GovernedEvidenceTile href={canLineage?lineageHref:undefined} label="Lineage footprint" value={`${lineageAssets.length} assets`} detail={`${lineageEdgeCount} relationships · ${lineageMappingCount} field mappings · open technical view`}/>
      <GovernedEvidenceTile href={canContracts?'/contracts':undefined} label="Data contracts" value={String(activeContracts.length)} detail={`${dataContracts.length} linked contract${dataContracts.length===1?'':'s'}`}/>
      <GovernedEvidenceTile href={canObservability?'/observability':undefined} label="Open observability alerts" value={String(openAlerts.length)} detail={`${observabilityAlerts.length} recent alert${observabilityAlerts.length===1?'':'s'}`}/>
      <GovernedEvidenceTile href={canAgents?'/agents':undefined} label="Agent activity" value={String(agentRuns.length)} detail={`${successfulAgentRuns.length} successful recent run${successfulAgentRuns.length===1?'':'s'}`}/>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <GovernedEvidenceTile href={canStewardship?'/stewardship':undefined} label="Ownership" value={hasAccountability?'Assigned':'Missing'} detail="Business owner or steward"/>
      <GovernedEvidenceTile href={canGlossary?'/glossary':undefined} label="Business meaning" value={String(approvedGlossary)} detail="Approved glossary mappings"/>
      <GovernedEvidenceTile href={canClassification?'/classification':undefined} label="Classification & CDE" value={`${approvedClassifications} / ${cdeCount}`} detail="Approved classifications / critical data mappings"/>
      <GovernedEvidenceTile href={canIssues?'/issues':undefined} label="Remediation" value={String(openIssues.length)} detail="Open governed issues"/>
    </div>
  </GovernedSection>

    const sectionRegistry:Record<DatasetSectionKey,ReactNode>={quality:<div id="quality" className="scroll-mt-28">{qualitySection}</div>,issues:<div id="issues" className="scroll-mt-28">{issuesSection}</div>,findings:<div id="findings" className="scroll-mt-28">{findingsSection}</div>,governance:<div id="responsibilities" className="scroll-mt-28">{governanceSection}</div>}

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0b1422] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Dataset 360" contextLabel={dataset.name} homeHref="/home" />
    <nav className={`${surface} mt-4 flex items-center justify-between gap-3 overflow-x-auto px-5 py-3`}><Link href="/catalog" className={`inline-flex shrink-0 items-center gap-2 text-sm font-bold text-slate-300 hover:text-white ${focus}`}><ArrowLeft className="h-4 w-4"/>Data Catalog</Link><div className="flex shrink-0 gap-2">{canProfiling&&run?<Link href={profilingHref} className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Profiling evidence</Link>:null}{canLineage?<Link href={lineageHref} className={`rounded-xl px-3 py-2 text-sm font-semibold text-violet-300 hover:bg-white/[0.05] ${focus}`}>Lineage</Link>:null}{canContracts?<Link href="/contracts" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Contracts</Link>:null}{canObservability?<Link href="/observability" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Observability</Link>:null}{canAgents?<Link href="/agents" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Agents</Link>:null}{canIssues?<Link href="/issues" className={`rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Issues</Link>:null}{canJourneys?<Link href={canonicalRoutes.governanceRun(dataset.project_id)} className={`rounded-xl px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-white/[0.05] ${focus}`}>Governance Run</Link>:null}</div></nav>

    <header id="summary" className={`${surface} mt-5 scroll-mt-28 p-6 sm:p-7`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="flex flex-wrap items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Database className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">{presentation.lensLabel}</p><h1 className="mt-1 text-3xl font-black text-white">{dataset.name}</h1></div></div>
          <p className="mt-4 text-base font-bold text-slate-200">{presentation.primaryQuestion}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{catalog?.business_description||dataset.description||'No governed business description is available yet.'}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/ai-insights?projectId=${encodeURIComponent(dataset.project_id)}&datasetId=${encodeURIComponent(dataset.id)}&prompt=${encodeURIComponent(`Explain the current trust, risks and governed evidence for ${dataset.name} for a ${presentation.lensLabel.toLowerCase()}`)}`} className={`rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-bold text-white ${focus}`}>Ask DataNexus AI <ArrowRight className="ml-1 inline h-4 w-4"/></Link>
            {canLineage?<Link href={lineageHref} className={`rounded-xl border border-violet-400/20 bg-violet-400/[0.06] px-4 py-3 text-sm font-bold text-violet-200 hover:bg-violet-400/10 ${focus}`}>Explore technical lineage <GitBranch className="ml-1 inline h-4 w-4"/></Link>:null}
          </div>
          <p className="mt-4 text-[11px] text-slate-600">Persona-aware presentation only. Governed evidence, policy and authorization are unchanged.</p>
        </div>
        <aside aria-label="Dataset at a glance" className={`${inset} p-4`}>
          <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">At a glance</p>
          <dl className="mt-3 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Certification</dt><dd className="font-bold text-blue-300">{catalog?.certification_status||'UNCERTIFIED'}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Criticality</dt><dd className="font-bold text-amber-300">{catalog?.criticality||'UNSET'}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Domain</dt><dd className="max-w-[160px] truncate font-bold text-slate-300">{dataset.business_domain||'Unassigned'}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Accountability</dt><dd className={`font-bold ${hasAccountability?'text-emerald-300':'text-amber-300'}`}>{hasAccountability?'Assigned':'Missing'}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Quality</dt><dd className="font-bold text-cyan-300">{pct(score?.overall_score)}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Open issues</dt><dd className={`font-bold ${openIssues.length?'text-rose-300':'text-emerald-300'}`}>{openIssues.length}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Retention</dt><dd className="font-bold text-slate-300">{catalog?.retention_days? `${catalog.retention_days} days` : 'Not set'}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Last observed</dt><dd className="max-w-[160px] text-right font-bold text-slate-300">{run?.completed_at?new Date(run.completed_at).toLocaleString():version?.observed_at?new Date(version.observed_at).toLocaleString():'Not observed'}</dd></div>
          </dl>
        </aside>
      </div>
    </header>

    <nav aria-label="Dataset 360 views" className={`${surface} sticky top-2 z-20 mt-4 flex gap-1 overflow-x-auto p-2 backdrop-blur`}>
      <a href="#summary" aria-current="page" className={`shrink-0 rounded-xl bg-blue-600/20 px-3 py-2 text-sm font-bold text-blue-200 ring-1 ring-blue-400/20 ${focus}`}>Summary</a>
      <a href="#relationships" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Relationships</a>
      {canLineage?<Link href={lineageHref} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-violet-300 hover:bg-white/[0.05] ${focus}`}>Technical Lineage</Link>:null}
      {canProfiling&&run?<a href="#quality" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Quality</a>:null}
      <a href="#responsibilities" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Responsibilities</a>
      <a href="#issues" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Issues</a>
      {canAgents?<Link href="/agents" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Activity</Link>:canObservability?<Link href="/observability" className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/[0.05] ${focus}`}>Activity</Link>:null}
    </nav>

    <DatasetTrustSignals certification={catalog?.certification_status||'UNCERTIFIED'} quality={score?.overall_score} observedAt={run?.completed_at??version?.observed_at??version?.created_at??null} hasAccountability={hasAccountability} openIssues={openIssues.length}/>

    <div id="relationships" className="mt-5 scroll-mt-28">{connectedContextSection}</div>

    {canExecuteProfiling&&version?<section className={`${surface} mt-5 p-5`} aria-label="Profiling readiness actions"><div className="mb-3"><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Profiling readiness</p><p className="mt-1 text-sm text-slate-400">Deterministic readiness is authoritative. Governed AI may diagnose blockers and only execute policy-authorized low-risk repair.</p></div><DatasetActions projectId={dataset.project_id} datasetId={dataset.id} datasetVersionId={version.id} agentDefinitionId={agentDefinition?.id??null} ready={false}/></section>:null}

    <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{presentation.metricOrder.map(key=><div key={key}>{metricRegistry[key]}</div>)}</section>

    <div className="mt-5 space-y-5">{presentation.sectionOrder.map(key=><div key={key}>{sectionRegistry[key]}</div>)}</div>

    <footer className={`${surface} mt-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-slate-600`}><span>{presentation.objective}</span><span>{presentation.truthBoundary} · {presentation.authorizationBoundary}</span></footer>
  </div></main>
}