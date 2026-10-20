import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { createClient } from '@/lib/supabase/server'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { SourceArtifactScanWorkbench } from '@/components/catalog/source-artifact-scan-workbench'

export default async function SourceArtifactScanPage(){
  const user=await requireUser()
  const [landing,supabase]=await Promise.all([resolveLandingAccess(user.id),createClient()])
  const {data:projects}=await supabase.schema('app').from('projects').select('id,name').order('name')
  const projectOptions=await Promise.all((projects??[]).map(async project=>({id:String(project.id),name:String(project.name),canPersist:await hasProjectCapability(user.id,String(project.id),'source.manage')})))
  return <main id="main-content" tabIndex={-1} className="dn-light-workspace min-h-screen bg-[#0b1422] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Source Artifact Scan" contextLabel="Code, macro, script and log metadata discovery" homeHref="/home"/><nav className="mb-6 mt-4 flex justify-end rounded-2xl border border-white/10 bg-[#102036] p-3"><Link href="/catalog" className="rounded-xl px-3 py-2 text-sm font-bold text-blue-300 hover:bg-white/[0.05]">Back to Catalog</Link></nav><header className="mb-5 rounded-3xl border border-white/10 bg-[#102036] p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Metadata scanning</p><h1 className="mt-2 text-3xl font-black">Source code and automation discovery</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">Deterministic scanning for .NET, Node.js, VBA, macros, scripts and logs. Review results in dry-run mode, then persist only extracted governed metadata. Source content itself is never stored.</p></header><SourceArtifactScanWorkbench projects={projectOptions}/></div></main>
}
