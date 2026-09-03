import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectRoleManager, type GovernanceRole, type ProjectRoleBinding, type ProjectRoleMember, type ProjectRoleProject } from './project-role-manager'

export default async function ProjectRolesPage(){
  const user=await requireUser();const admin=createAdminClient()
  const {data:adminMemberships,error:membershipError}=await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id).in('role',['OWNER','ADMIN'])
  if(membershipError)throw new Error(`Unable to load administrator memberships: ${membershipError.message}`)
  const orgIds=(adminMemberships??[]).map(row=>row.organization_id)
  if(!orgIds.length)return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-4xl rounded-3xl border bg-white p-8 shadow-sm"><ShieldCheck className="h-8 w-8 text-amber-600"/><h1 className="mt-4 text-2xl font-black">Project governance roles</h1><p className="mt-2 text-slate-600">Organization OWNER or ADMIN access is required.</p><Link href="/dashboard" className="mt-5 inline-block font-bold text-blue-600">Return to dashboard</Link></div></main>

  const [projectsResult,membersResult,rolesResult,bindingsResult,usersResult]=await Promise.all([
    admin.schema('app').from('projects').select('id,organization_id,name').in('organization_id',orgIds).order('name'),
    admin.schema('app').from('organization_members').select('organization_id,user_id,role').in('organization_id',orgIds).order('created_at'),
    admin.schema('governance').from('access_roles').select('role_key,name,description,capabilities').order('name'),
    admin.schema('governance').from('project_role_bindings').select('id,project_id,user_id,role_key,active,assigned_at,expires_at').in('project_id',(await admin.schema('app').from('projects').select('id').in('organization_id',orgIds)).data?.map(row=>row.id)??[]).order('assigned_at',{ascending:false}),
    admin.auth.admin.listUsers({page:1,perPage:1000}),
  ])
  if(projectsResult.error)throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  if(membersResult.error)throw new Error(`Unable to load members: ${membersResult.error.message}`)
  if(rolesResult.error)throw new Error(`Unable to load governance roles: ${rolesResult.error.message}`)
  if(bindingsResult.error)throw new Error(`Unable to load role bindings: ${bindingsResult.error.message}`)
  if(usersResult.error)throw new Error(`Unable to load member directory: ${usersResult.error.message}`)
  const emails=new Map(usersResult.data.users.map(item=>[item.id,item.email??item.id]))
  const projects:ProjectRoleProject[]=(projectsResult.data??[]).map(row=>({id:row.id,organizationId:row.organization_id,name:row.name}))
  const members:ProjectRoleMember[]=(membersResult.data??[]).map(row=>({organizationId:row.organization_id,userId:row.user_id,email:emails.get(row.user_id)??row.user_id,organizationRole:String(row.role)}))
  const roles:GovernanceRole[]=(rolesResult.data??[]).map(row=>({roleKey:row.role_key,name:row.name,description:row.description,capabilities:Array.isArray(row.capabilities)?row.capabilities:[]}))
  const bindings:ProjectRoleBinding[]=(bindingsResult.data??[]).map(row=>({id:row.id,projectId:row.project_id,userId:row.user_id,roleKey:row.role_key,active:row.active,assignedAt:row.assigned_at,expiresAt:row.expires_at}))

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="font-black">Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/admin" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Organization access</Link><Link href="/platform" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Platform controls</Link><Link href="/audit" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Audit</Link></div></nav><header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><ShieldCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Fine grained authorization</p><h1 className="text-3xl font-black">Project governance roles</h1></div></div><p className="mt-4 max-w-4xl text-sm leading-6 text-slate-600">Assign operational governance capabilities by project without granting organization-wide administration. Changes are enforced by centralized server authorization and written to the immutable audit trail.</p></header><div className="mt-6"><ProjectRoleManager projects={projects} members={members} roles={roles} bindings={bindings}/></div></div></main>
}
