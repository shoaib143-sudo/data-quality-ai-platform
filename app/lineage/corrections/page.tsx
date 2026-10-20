import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import { LineageCorrectionManager } from '@/components/lineage/lineage-correction-manager'

export default async function LineageCorrectionsPage(){
  await requireWorkspaceAccess('lineage-manage')
  const user=await requireUser()
  const [supabase,landing]=await Promise.all([createClient(),resolveLandingAccess(user.id)])
  const {data:projects,error}=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(error)throw new Error(error.message)
  return <main id="main-content" tabIndex={-1} className="dn-light-workspace min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Lineage Corrections" contextLabel="Approval-gated manual lineage changes" homeHref="/home"/><nav className="mb-6 mt-4 flex justify-end rounded-2xl border bg-white p-3"><Link href="/lineage" className="rounded-xl px-3 py-2 text-sm font-bold text-violet-600 hover:bg-violet-50">Lineage Explorer</Link></nav><header className="mb-5 rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><p className="text-xs font-black uppercase tracking-[.16em] text-violet-600">Governed correction</p><h1 className="mt-2 text-3xl font-black">Manual lineage corrections</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">Propose corrections, route them through the existing approval engine, and apply only approved source-to-target relationships as auditable manual evidence.</p></header><LineageCorrectionManager projects={(projects??[]).map(p=>({id:String(p.id),name:String(p.name)}))}/></div></main>
}
