import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminManager, type AdminMember, type AdminOrganization, type AdminProject } from './admin-manager'

export default async function AdminPage() {
  const user=await requireUser()
  const admin=createAdminClient()

  const { data: myMemberships, error: membershipError } = await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id).in('role',['OWNER','ADMIN'])
  if(membershipError) throw new Error(`Unable to load administrator memberships: ${membershipError.message}`)
  const organizationIds=(myMemberships??[]).map((membership)=>membership.organization_id)

  if(!organizationIds.length) {
    return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-4xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-8 w-8 text-amber-600"/><h1 className="mt-4 text-2xl font-black">Organization administration</h1><p className="mt-2 text-slate-600">OWNER or ADMIN membership is required to manage organization access.</p><Link href="/dashboard" className="mt-6 inline-block text-sm font-bold text-blue-600">Return to dashboard</Link></div></main>
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

  return <main className="min-h-screen bg-[radial-gradient(circle_at_5%_0%,_rgba(219,234,254,0.85),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_55%,_#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white bg-white/90 px-5 py-3 shadow-sm">
        <Link href="/dashboard" className="font-black">Data Governance PowerHouse</Link>
        <div className="flex flex-wrap gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Catalog</Link><Link href="/stewardship" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Stewardship</Link><Link href="/audit" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Audit</Link></div>
      </nav>
      <header className="mb-6 rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><ShieldCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Administration</p><h1 className="text-3xl font-black">Organization access control</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">Manage membership and governance roles with last-owner protection and an auditable change trail.</p></header>
      <AdminManager organizations={organizationRows} members={memberRows} projects={projectRows} currentUserId={user.id}/>
    </div>
  </main>
}
