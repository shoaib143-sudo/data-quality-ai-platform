import Link from 'next/link'
import { Gauge, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PlatformControls, type PlatformProject } from './platform-controls'

export default async function PlatformPage(){
  const user=await requireUser()
  const admin=createAdminClient()
  const {data:memberships,error:membershipError}=await admin.schema('app').from('organization_members').select('organization_id,role').eq('user_id',user.id)
  if(membershipError)throw new Error(`Unable to load platform membership: ${membershipError.message}`)
  const orgIds=(memberships??[]).map(row=>row.organization_id)
  const {data:projects,error:projectError}=orgIds.length
    ? await admin.schema('app').from('projects').select('id,organization_id,name,description').in('organization_id',orgIds).order('name')
    : {data:[],error:null}
  if(projectError)throw new Error(`Unable to load platform projects: ${projectError.message}`)
  const roleByOrg=new Map((memberships??[]).map(row=>[row.organization_id,String(row.role)]))
  const rows:PlatformProject[]=(projects??[]).map(project=>({
    id:project.id,
    name:project.name,
    description:project.description,
    organizationId:project.organization_id,
    organizationRole:roleByOrg.get(project.organization_id)??'MEMBER',
  }))

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-black"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex gap-2 text-sm"><Link href="/monitoring" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Job Monitor</Link><Link href="/admin" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Administration</Link><Link href="/audit" className="rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-blue-50">Audit</Link></div></nav>
    <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><Gauge className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Platform reliability</p><h1 className="text-3xl font-black">Capacity, recovery and release gates</h1></div></div><p className="mt-4 max-w-4xl text-sm leading-6 text-slate-600">Operate project capacity limits, deterministic profiling boundaries, recovery objectives, drill evidence and automated platform contract checks from one governed control plane.</p></header>
    <div className="mt-6"><PlatformControls projects={rows}/></div>
  </div></main>
}
