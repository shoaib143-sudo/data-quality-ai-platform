import Link from 'next/link'
import { Activity, BrainCircuit, CheckCircle2, CircleDashed, DatabaseZap, ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }
type Capability = {
  capability_id: number
  capability: string
  evidence_domain: string
  status: 'EVIDENCED' | 'BOOTSTRAP_ONLY' | 'DATA_PENDING' | 'NOT_EVIDENCED' | string
  evidence_count: number
  evidence_source: string
}

const statusOrder = ['NOT_EVIDENCED', 'DATA_PENDING', 'BOOTSTRAP_ONLY', 'EVIDENCED']

function statusDescription(status: string) {
  if (status === 'EVIDENCED') return 'Live project evidence supports this capability.'
  if (status === 'BOOTSTRAP_ONLY') return 'Framework or synthetic bootstrap evidence exists, but governed enterprise evidence is still missing.'
  if (status === 'DATA_PENDING') return 'The capability contract exists, but required source evidence has not been ingested.'
  return 'No qualifying live evidence currently demonstrates this capability.'
}

function statusTone(status: string) {
  if (status === 'EVIDENCED') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'BOOTSTRAP_ONLY') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (status === 'DATA_PENDING') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-red-200 bg-red-50 text-red-800'
}

export default async function AICapabilitiesPage({ searchParams }: { searchParams: Promise<{ projectId?: string; status?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id
  const selectedStatus = params.status && [...statusOrder, 'ALL'].includes(params.status) ? params.status : 'ALL'

  let matrix: Capability[] = []
  let enterpriseKnowledgeCount = 0
  let totalKnowledgeCount = 0

  if (selectedProjectId) {
    await authorizeProject(user.id, selectedProjectId, 'catalog.read')
    const admin = createAdminClient()
    const [matrixResult, knowledgeResult, enterpriseKnowledgeResult] = await Promise.all([
      admin.schema('governance').rpc('generate_ai_capability_matrix', { p_project_id: selectedProjectId }),
      admin.schema('governance').from('knowledge_documents').select('id', { count: 'exact', head: true }).eq('project_id', selectedProjectId).eq('status', 'ACTIVE'),
      admin.schema('governance').from('knowledge_documents').select('id', { count: 'exact', head: true })
        .eq('project_id', selectedProjectId).eq('status', 'ACTIVE').eq('review_status', 'APPROVED').neq('source_kind', 'SYNTHETIC'),
    ])
    if (matrixResult.error) throw new Error(`Unable to generate AI capability matrix: ${matrixResult.error.message}`)
    if (knowledgeResult.error) throw new Error(`Unable to count governance knowledge: ${knowledgeResult.error.message}`)
    if (enterpriseKnowledgeResult.error) throw new Error(`Unable to count approved governance knowledge: ${enterpriseKnowledgeResult.error.message}`)
    matrix = (matrixResult.data ?? []) as Capability[]
    totalKnowledgeCount = knowledgeResult.count ?? 0
    enterpriseKnowledgeCount = enterpriseKnowledgeResult.count ?? 0
  }

  const counts = Object.fromEntries(statusOrder.map((status) => [status, matrix.filter((row) => row.status === status).length])) as Record<string, number>
  const filtered = selectedStatus === 'ALL' ? matrix : matrix.filter((row) => row.status === selectedStatus)
  const evidenceRate = matrix.length ? Math.round(((counts.EVIDENCED ?? 0) / matrix.length) * 100) : 0

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 p-5 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-950">← Dashboard</Link><Link href="/ai-insights" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Open AI Insights</Link></div>

        <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><BrainCircuit className="h-6 w-6" /></span><div><h1 className="text-3xl font-black tracking-tight">AI Capability Control Center</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Operational status for all 75 strategic DataNexus AI capabilities. A green capability means qualifying project evidence exists. It does not mean the capability executes on every dataset or that AI has governance authority.</p></div></div></header>

        <form method="get" className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-[1fr_240px_auto]"><label className="text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-sm font-semibold">Evidence state<select name="status" defaultValue={selectedStatus} className="mt-2 w-full rounded-xl border bg-white px-3 py-2 font-normal"><option value="ALL">All</option>{statusOrder.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button className="self-end rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Apply</button></form>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5 text-blue-600"/><p className="mt-3 text-3xl font-black">{matrix.length}</p><p className="text-xs font-bold uppercase text-slate-500">Tracked capabilities</p></div><div className="rounded-2xl border bg-white p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-3xl font-black">{counts.EVIDENCED ?? 0}</p><p className="text-xs font-bold uppercase text-slate-500">Evidenced</p></div><div className="rounded-2xl border bg-white p-5"><DatabaseZap className="h-5 w-5 text-amber-600"/><p className="mt-3 text-3xl font-black">{counts.DATA_PENDING ?? 0}</p><p className="text-xs font-bold uppercase text-slate-500">Data pending</p></div><div className="rounded-2xl border bg-white p-5"><CircleDashed className="h-5 w-5 text-blue-600"/><p className="mt-3 text-3xl font-black">{counts.BOOTSTRAP_ONLY ?? 0}</p><p className="text-xs font-bold uppercase text-slate-500">Bootstrap only</p></div><div className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5 text-violet-600"/><p className="mt-3 text-3xl font-black">{evidenceRate}%</p><p className="text-xs font-bold uppercase text-slate-500">Evidence coverage</p></div></section>

        <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border bg-white p-6"><h2 className="text-lg font-black">Governance knowledge readiness</h2><p className="mt-2 text-sm leading-6 text-slate-600">{enterpriseKnowledgeCount > 0 ? `${enterpriseKnowledgeCount} approved non-synthetic governance documents are available for policy-aware intelligence.` : 'No approved non-synthetic governance corpus is available. Policy, standards and regulatory capabilities therefore remain bootstrap-only rather than pretending synthetic knowledge is enterprise authority.'}</p><div className="mt-4 flex gap-4 text-sm"><span><b>{totalKnowledgeCount}</b> active documents</span><span><b>{enterpriseKnowledgeCount}</b> enterprise-approved</span></div></article><article className="rounded-2xl border bg-white p-6"><h2 className="text-lg font-black">How to read the matrix</h2><div className="mt-3 space-y-2 text-sm text-slate-600">{statusOrder.map((status) => <p key={status}><span className={`mr-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${statusTone(status)}`}>{status}</span>{statusDescription(status)}</p>)}</div></article></section>

        <section className="rounded-2xl border bg-white p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">Capability evidence</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} capabilities in the current view</p></div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Capability</th><th className="px-3 py-3">State</th><th className="px-3 py-3">Evidence domain</th><th className="px-3 py-3">Evidence count</th><th className="px-3 py-3">Evidence source</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.capability_id} className="border-b align-top last:border-0"><td className="px-3 py-4 font-black">{row.capability_id}</td><td className="px-3 py-4"><p className="font-bold">{row.capability}</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{statusDescription(row.status)}</p></td><td className="px-3 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(row.status)}`}>{row.status}</span></td><td className="px-3 py-4 text-slate-600">{row.evidence_domain}</td><td className="px-3 py-4 font-bold">{row.evidence_count}</td><td className="px-3 py-4 font-mono text-xs text-slate-500">{row.evidence_source}</td></tr>)}</tbody></table></div></section>
      </div>
    </main>
  )
}
