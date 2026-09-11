import Link from 'next/link'
import { FileBarChart2 } from 'lucide-react'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ReportManager, type ReportProject } from './report-manager'

export default async function ReportsPage() {
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const supabase=await createClient()
  const {data:projects,error:projectsError}=await supabase.schema('app').from('projects').select('id,name,description').order('name')
  if(projectsError) throw new Error(`Unable to load report projects: ${projectsError.message}`)
  const projectIds=(projects??[]).map((project)=>project.id)

  const [{data:datasets,error:datasetsError},{data:sources,error:sourcesError}]=projectIds.length?await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,data_source_id').in('project_id',projectIds),
    supabase.schema('catalog').from('data_sources').select('id,project_id,source_type,status').in('project_id',projectIds),
  ]):[{data:[],error:null},{data:[],error:null}]
  if(datasetsError) throw new Error(`Unable to load report datasets: ${datasetsError.message}`)
  if(sourcesError) throw new Error(`Unable to load report sources: ${sourcesError.message}`)

  const datasetIds=(datasets??[]).map((dataset)=>dataset.id)
  const sourceIds=(sources??[]).map((source)=>source.id)
  const [{data:issues,error:issuesError},{data:alerts,error:alertsError},{data:readiness,error:readinessError},{data:jdbcEvidence,error:jdbcEvidenceError}]=await Promise.all([
    datasetIds.length?supabase.schema('governance').from('issues').select('id,project_id,dataset_id,status').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
    datasetIds.length?supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,status').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
    sourceIds.length?supabase.schema('catalog').from('source_operational_readiness').select('source_id,project_id,operational_state,has_observation_evidence').in('source_id',sourceIds):Promise.resolve({data:[],error:null}),
    sourceIds.length?supabase.schema('catalog').from('jdbc_discovery_evidence').select('source_id,project_id,evidence_state,multi_namespace_observed,repeat_scan_stable').in('source_id',sourceIds):Promise.resolve({data:[],error:null}),
  ])
  if(issuesError) throw new Error(`Unable to load report issues: ${issuesError.message}`)
  if(alertsError) throw new Error(`Unable to load report alerts: ${alertsError.message}`)
  if(readinessError) throw new Error(`Unable to load report source readiness: ${readinessError.message}`)
  if(jdbcEvidenceError) throw new Error(`Unable to load report JDBC evidence: ${jdbcEvidenceError.message}`)

  const rows:ReportProject[]=(projects??[]).map((project)=>({
    id:project.id,
    name:project.name,
    description:project.description,
    datasetCount:(datasets??[]).filter((dataset)=>dataset.project_id===project.id).length,
    openIssues:(issues??[]).filter((issue)=>issue.project_id===project.id&&!['RESOLVED','CLOSED'].includes(String(issue.status).toUpperCase())).length,
    openAlerts:(alerts??[]).filter((alert)=>alert.project_id===project.id&&alert.status!=='RESOLVED').length,
    sourceCount:(sources??[]).filter((source)=>source.project_id===project.id).length,
    observedReadySources:(readiness??[]).filter((source)=>source.project_id===project.id&&source.operational_state==='OBSERVED_READY').length,
    unobservedSources:(readiness??[]).filter((source)=>source.project_id===project.id&&source.operational_state==='UNOBSERVED').length,
    stableJdbcSources:(jdbcEvidence??[]).filter((source)=>source.project_id===project.id&&source.repeat_scan_stable===true).length,
  }))

  const canCatalog=canAccessWorkspace(landing.persona,'catalog',landing.organizationRole)
  const canObservability=canAccessWorkspace(landing.persona,'observability',landing.organizationRole)
  const canAudit=canAccessWorkspace(landing.persona,'audit',landing.organizationRole)

  return <main className="min-h-screen bg-[#061426] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="font-black text-white">DataNexus AI</Link><div className="flex flex-wrap gap-2 text-sm">{canCatalog?<Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Catalog</Link>:null}{canObservability?<Link href="/observability" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Observability</Link>:null}{canAudit?<Link href="/audit" className="rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Audit</Link>:null}</div></nav>
      <header className="mb-6 rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><FileBarChart2 className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Governance reporting</p><h1 className="text-3xl font-black text-white">Evidence and control reports</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Export project-level governance evidence for audit, stewardship reviews, risk committees and downstream analytics. Source lifecycle remains configuration authority while operational and JDBC states are reported only from governed observation evidence.</p><div className="mt-5"><Link href="/reports/experience" className="inline-flex rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-sm font-bold text-cyan-200 hover:bg-cyan-300/15">Open experience insights</Link></div></header>
      {rows.length?<ReportManager projects={rows}/>:<section className="rounded-3xl border border-white/10 bg-[#0a1d33] p-8 text-sm text-slate-500 shadow-sm">No accessible projects are available for reporting.</section>}
    </div>
  </main>
}