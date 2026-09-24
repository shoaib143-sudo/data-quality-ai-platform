import Link from 'next/link'
import { Building2, FolderKanban, ShieldCheck, Users } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminManager, type AdminMember, type AdminOrganization, type AdminProject } from './admin-manager'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export default async function AdminPage() {
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  const canAdminWorkspace=canAccessWorkspaceHref(landing.persona,'/admin',landing.organizationRole)
  const admin=createAdminClient()

  const { data: myMemberships, error: membershipError } = await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id).in('role',['OWNER','ADMIN'])
  if(membershipError) throw new Error(`Unable to load administrator memberships: ${membershipError.message}`)
  const organizationIds=(myMemberships??[]).map((membership)=>membership.organization_id)

  if(!organizationIds.length) {
    return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] p-5 text-slate-100 sm:p-6"><div className="mx-auto max-w-4xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Administration" contextLabel="Organization access control" homeHref="/home" /><div className="mt-6 rounded-[26px] border border-amber-300/20 bg-[#09192d] p-8 shadow-[0_20px_60px_rgba(0,0,0,.24)]"><ShieldCheck className="h-8 w-8 text-amber-300"/><p className="mt-4 text-xs font-black uppercase tracking-[0.15em] text-amber-300">Restricted administration</p><h1 className="mt-2 text-2xl font-black text-white">Organization administration</h1><p className="mt-2 text-slate-400">OWNER or ADMIN membership is required to manage organization access.</p><Link href="/home" className="mt-6 inline-block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-bold text-slate-200">Return home</Link></div></div></main>
  }

  const [{data:organizations,error:organizationsError},{data:memberships,error:membershipsError},{data:projects,error:projectsError},authUsersResult]=await Promise.all([
    admin.schema('app').from('organizations').select('id,name').in('id',organizationIds).order('name'),
    admin.schema('app').from('organization_members').select('organization_id,user_id,role,created_at').in('organization_id',organizationIds).order('created_at'),
    admin.schema('app').from('projects').select('id,organization_id,name,description').in('organization_id',organizationIds).order('name'),
    admin.auth.admin.listUsers({page:1,perPage:1000}),
  ])
  if(organizationsError) throw new Error(`Unable to load organizations: ${organizationsError.message}`)
  if(membershipsError) throw new Error(`Unable to load organization members: ${membershipsError.message}`)
  if(projectsError) throw new Error(`Unable to load projects: ${projectsError.message}`)
  if(authUsersResult.error) throw new Error(`Unable to load member directory: ${authUsersResult.error.message}`)

  const myRoleByOrg=new Map((myMemberships??[]).map((membership)=>[membership.organization_id,String(membership.role) as 'OWNER'|'ADMIN']))
  const emailByUser=new Map(authUsersResult.data.users.map((authUser)=>[authUser.id,authUser.email??'']))

  const organizationRows:AdminOrganization[]=(organizations??[]).flatMap((organization)=>{
    const currentRole=myRoleByOrg.get(organization.id)
    return currentRole?[{id:organization.id,name:organization.name,currentRole}]:[]
  })
  const memberRows:AdminMember[]=(memberships??[]).map((membership)=>({
    organizationId:membership.organization_id,
    userId:membership.user_id,
    email:emailByUser.get(membership.user_id)??'',
    role:String(membership.role) as AdminMember['role'],
    createdAt:membership.created_at,
  }))
  const projectRows:AdminProject[]=(projects??[]).map((project)=>({id:project.id,organizationId:project.organization_id,name:project.name,description:project.description}))

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#050b17] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1480px]">
      <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Administration" contextLabel="Organization access control" homeHref="/home" />
      {canAdminWorkspace ? <div><nav aria-label="Administration workspaces" className="mb-4 mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#09192d] p-2 text-xs"><Link href="/admin" aria-current="page" className="shrink-0 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 font-bold text-cyan-200">Organization Access</Link><Link href="/admin/cleanup" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-rose-300 hover:bg-white/[0.04]">Super Admin Cleanup</Link><Link href="/admin/project-roles" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.04]">Project Roles</Link><Link href="/admin/landing-pages" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.04]">Landing Pages</Link><Link href="/admin/identity" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-slate-300 hover:bg-white/[0.04]">Enterprise Identity</Link><Link href="/admin/infrastructure" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-cyan-300 hover:bg-white/[0.04]">Infrastructure</Link><Link href="/admin/ai-command-center" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.04]">AI Command Center</Link><Link href="/admin/ai-command-center/resource-controls" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.04]">AI Resource Controls</Link><Link href="/admin/ai-command-center/audit" className="shrink-0 rounded-xl px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.04]">AI Audit Evidence</Link></nav></div> : null}
      <header className="relative mb-5 overflow-hidden rounded-[28px] border border-cyan-300/12 bg-[#09192d] p-7 shadow-[0_24px_70px_rgba(0,0,0,.26)]">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/[0.08] blur-3xl"/>
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px] xl:items-end">
          <div>
            <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-300"><ShieldCheck className="h-6 w-6" aria-hidden="true"/></span><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Administration</p><h1 className="mt-1 text-3xl font-black tracking-tight text-white">Organization access control</h1></div></div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">Manage membership, governance personas and role-based landing experiences with last-owner protection and an auditable change trail. Organization administration remains separate from governance workspace access.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-cyan-300/12 bg-[#061321] p-3"><Building2 className="h-4 w-4 text-cyan-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{organizationRows.length}</p><p className="text-[10px] text-slate-500">Organizations</p></div>
            <div className="rounded-2xl border border-violet-300/12 bg-[#061321] p-3"><Users className="h-4 w-4 text-violet-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{memberRows.length}</p><p className="text-[10px] text-slate-500">Memberships</p></div>
            <div className="rounded-2xl border border-blue-300/12 bg-[#061321] p-3"><FolderKanban className="h-4 w-4 text-blue-300" aria-hidden="true"/><p className="mt-2 text-2xl font-black text-white">{projectRows.length}</p><p className="text-[10px] text-slate-500">Projects</p></div>
          </div>
        </div>
      </header>
      <AdminManager organizations={organizationRows} members={memberRows} projects={projectRows} currentUserId={user.id}/>
    </div>
  </main>
}