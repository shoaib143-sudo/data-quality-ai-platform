import Link from 'next/link'
import { ArchiveRestore } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { RetentionManager, type RetentionProject } from './retention-manager'

export default async function RetentionPage(){
  const user=await requireUser()
  const admin=createAdminClient()
  const {data:memberships,error:membershipError}=await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id).in('role',['OWNER','ADMIN'])
  if(membershipError)throw new Error(`Unable to load administrator memberships: ${membershipError.message}`)
  const organizationIds=(memberships??[]).map((membership)=>membership.organization_id)
  const {data:projects,error:projectsError}=organizationIds.length?await admin.schema('app').from('projects').select('id,name,organization_id').in('organization_id',organizationIds).order('name'):{data:[],error:null}
  if(projectsError)throw new Error(`Unable to load retention projects: ${projectsError.message}`)
  const projectIds=(projects??[]).map((project)=>project.id)
  const [{data:policies,error:policiesError},{data:archive,error:archiveError}]=await Promise.all([
    projectIds.length?admin.schema('governance').from('retention_policies').select('project_id,profile_history_days,agent_job_history_days,minimum_profile_runs,minimum_agent_runs,enabled,legal_hold,last_executed_at,last_result').in('project_id',projectIds):Promise.resolve({data:[],error:null}),
    projectIds.length?admin.schema('governance').from('retention_archive').select('project_id,entity_type').in('project_id',projectIds):Promise.resolve({data:[],error:null}),
  ])
  if(policiesError)throw new Error(`Unable to load retention policies: ${policiesError.message}`)
  if(archiveError)throw new Error(`Unable to load retention archive: ${archiveError.message}`)
  const policyByProject=new Map((policies??[]).map((policy)=>[policy.project_id,policy]))
  const rows:RetentionProject[]=(projects??[]).map((project)=>{
    const policy=policyByProject.get(project.id)
    const projectArchive=(archive??[]).filter((item)=>item.project_id===project.id)
    return {
      id:project.id,
      name:project.name,
      profileHistoryDays:policy?.profile_history_days??365,
      agentJobHistoryDays:policy?.agent_job_history_days??180,
      minimumProfileRuns:policy?.minimum_profile_runs??5,
      minimumAgentRuns:policy?.minimum_agent_runs??50,
      enabled:policy?.enabled??false,
      legalHold:policy?.legal_hold??false,
      lastExecutedAt:policy?.last_executed_at??null,
      lastResult:(policy?.last_result??{}) as Record<string,unknown>,
      archivedProfiles:projectArchive.filter((item)=>item.entity_type==='PROFILE_RUN').length,
      archivedJobs:projectArchive.filter((item)=>item.entity_type==='AGENT_RUN').length,
    }
  })

  return <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(237,233,254,0.9),_transparent_30%),linear-gradient(180deg,_#faf9ff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-5 py-3 shadow-sm"><Link href="/dashboard" className="font-black">Data Governance PowerHouse</Link><div className="flex flex-wrap gap-2 text-sm"><Link href="/admin" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-violet-50">Admin</Link><Link href="/audit" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-violet-50">Audit</Link><Link href="/reports" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-violet-50">Reports</Link></div></nav>
    <header className="mb-6 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><ArchiveRestore className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Lifecycle governance</p><h1 className="text-3xl font-black">Retention and archival</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Define safe evidence retention with legal-hold protection. Eligible run history is compactly archived before deletion, while minimum recent baselines are always retained.</p></header>
    {rows.length?<RetentionManager projects={rows}/>:<section className="rounded-3xl border border-amber-200 bg-white p-8 text-sm text-slate-600 shadow-sm">OWNER or ADMIN access is required to configure project retention.</section>}
  </div></main>
}
