import Link from 'next/link'
import { Gauge } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { PlatformControlsV2, type PlatformProject } from './platform-controls-v2'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function PlatformPage(){
  const user=await requireUser()
  const [landing,admin]=await Promise.all([resolveLandingAccess(user.id),Promise.resolve(createAdminClient())])
  const canMonitoring=canAccessWorkspaceHref(landing.persona,'/monitoring',landing.organizationRole)
  const canAudit=canAccessWorkspaceHref(landing.persona,'/audit',landing.organizationRole)
  const canAdminWorkspace=canAccessWorkspaceHref(landing.persona,'/admin',landing.organizationRole)
  const {data:memberships,error:membershipError}=await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id)
  if(membershipError)throw new Error(`Unable to load platform membership: ${membershipError.message}`)
  const orgIds=(memberships??[]).map(row=>row.organization_id)
  const {data:projects,error:projectError}=orgIds.length
    ? await admin.schema('app').from('projects').select('id,organization_id,name,description').in('organization_id',orgIds).order('name')
    : {data:[],error:null}
  if(projectError)throw new Error(`Unable to load platform projects: ${projectError.message}`)
  const roleByOrg=new Map((memberships??[]).map(row=>[row.organization_id,String(row.role)]))
  const capabilityPairs=await Promise.all((projects??[]).map(async project=>({
    projectId:project.id,
    canManageCapacity:await hasProjectCapability(user.id,project.id,'capacity.manage'),
    canAdminPlatform:await hasProjectCapability(user.id,project.id,'admin.manage'),
  })))
  const capabilityByProject=new Map(capabilityPairs.map(item=>[item.projectId,item]))
  const rows:PlatformProject[]=(projects??[]).map(project=>({
    id:project.id,
    name:project.name,
    description:project.description,
    organizationId:project.organization_id,
    organizationRole:roleByOrg.get(project.organization_id)??'MEMBER',
    canManageCapacity:capabilityByProject.get(project.id)?.canManageCapacity??false,
    canAdminPlatform:capabilityByProject.get(project.id)?.canAdminPlatform??false,
  }))
  const canOpenOrgAdmin=(memberships??[]).some(row=>['OWNER','ADMIN'].includes(String(row.role).toUpperCase()))

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0b1422] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Platform Controls" contextLabel="Capacity, recovery and release gates" homeHref="/home" /><div className="mb-6 mt-4 flex flex-wrap justify-end gap-2 text-sm">{canMonitoring?<Link href="/monitoring" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Job Monitor</Link>:null}{canOpenOrgAdmin&&canAdminWorkspace?<Link href="/admin" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Administration</Link>:null}{canAudit?<Link href="/audit" className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white">Audit</Link>:null}</div>
    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-[10px_10px_28px_rgba(0,0,0,.22)]"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Gauge className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Platform reliability</p><h1 className="text-3xl font-black text-white">Capacity, recovery and release gates</h1></div></div><p className="mt-4 max-w-4xl text-sm leading-6 text-slate-400">Operate project capacity limits, deterministic profiling boundaries, recovery objectives, drill evidence and automated platform contract checks from one governed control plane. Controls appear only when the selected project grants the required capability.</p></header>
    <div className="mt-6"><PlatformControlsV2 projects={rows}/></div>
  </div></main>
}