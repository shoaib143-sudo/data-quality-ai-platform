import Link from 'next/link'
import { DollarSign, ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { createGovernanceResourceControlState } from '@/lib/ai/governance-resource-control-state'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

function valueOrDash(value: number | string | null) {
  return value == null ? 'Not recorded' : String(value)
}

export default async function PricingAuthorityPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id
  const state = selectedProjectId ? await (async () => {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    return createGovernanceResourceControlState().read(selectedProjectId)
  })() : null

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={selectedProjectId ? `/admin/ai-command-center?projectId=${selectedProjectId}` : '/admin/ai-command-center'} className="text-sm font-semibold text-slate-600">← AI Command Center</Link>
        <Link href={selectedProjectId ? `/admin/ai-command-center/resource-controls?projectId=${selectedProjectId}` : '/admin/ai-command-center/resource-controls'} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Resource controls</Link>
      </div>

      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><DollarSign className="h-6 w-6"/></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Governed pricing evidence</p>
            <h1 className="text-3xl font-black">Model Pricing Authority</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only visibility from the canonical effective provider/model pricing authority. Runtime USD cost limits, when configured on the canonical project budget, use exact provider-observed usage and the exact reviewed pricing version. No FX conversion or price inference is performed.</p>
          </div>
        </div>
      </header>

      <form method="get" className="rounded-2xl border bg-white p-5">
        <label className="block text-sm font-semibold">Project
          <select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load pricing authority</button>
      </form>

      {!state ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <>
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border bg-white p-5"><DollarSign className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.effectiveModelPricingAuthorities}</p><p className="text-xs font-bold uppercase text-slate-500">Effective pricing authorities</p></article>
          <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.controls.runtimeCostEnforcementEnabled ? 'ENABLED' : 'DISABLED'}</p><p className="text-xs font-bold uppercase text-slate-500">Runtime cost enforcement</p></article>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-xl font-black">Current approved pricing evidence</h2><p className="mt-1 max-w-4xl text-sm text-slate-500">Each row is the deterministic current authority for one project/provider/model/currency identity. Prices are stored per exactly 1,000,000 tokens. Runtime enforcement binds each priced invocation to the exact reviewed pricing version that was effective when provider usage was observed.</p></div>
            <span className="rounded-full border px-3 py-1 text-xs font-black">READ ONLY</span>
          </div>
          <div className="mt-5 overflow-x-auto">
            {state.modelPricingAuthorities.length ? <table className="w-full min-w-[1350px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Provider / model</th><th className="p-3">Pricing version</th><th className="p-3">Currency</th><th className="p-3">Unit</th><th className="p-3">Input price</th><th className="p-3">Output price</th><th className="p-3">Effective window</th><th className="p-3">Source reference</th><th className="p-3">Review authority</th></tr></thead>
              <tbody>{state.modelPricingAuthorities.map((pricing) => <tr key={pricing.id} className="border-b last:border-0">
                <td className="p-3 font-bold">{pricing.provider}<p className="font-mono text-[11px] text-slate-400">{pricing.model_id}</p></td>
                <td className="p-3">{pricing.pricing_version}<p className="font-mono text-[11px] text-slate-400">{pricing.id}</p></td>
                <td className="p-3 font-black">{pricing.currency}</td>
                <td className="p-3">{pricing.price_unit_tokens.toLocaleString()} tokens</td>
                <td className="p-3">{valueOrDash(pricing.input_price_per_million_tokens)}</td>
                <td className="p-3">{valueOrDash(pricing.output_price_per_million_tokens)}</td>
                <td className="p-3 text-xs">From {new Date(pricing.effective_from).toLocaleString()}<p className="text-slate-400">To {pricing.effective_to ? new Date(pricing.effective_to).toLocaleString() : 'open ended'}</p></td>
                <td className="p-3">{pricing.source_reference}<p className="max-w-sm break-all text-xs text-slate-400">{pricing.source_uri ?? 'URI not recorded'}</p></td>
                <td className="p-3">{pricing.reviewer_capability}<p className="text-xs text-slate-400">Reviewed {new Date(pricing.reviewed_at).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{pricing.review_note}</p></td>
              </tr>)}</tbody>
            </table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">No canonical current model pricing authority is recorded for this project. No price is inferred, scraped, or fabricated. If a hard USD cost limit is configured, missing pricing evidence fails closed rather than inventing a cost.</p>}
          </div>
        </section>

        <section className="rounded-2xl border bg-slate-950 p-6 text-white">
          <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5"/><h2 className="text-lg font-black">Authority boundary</h2></div>
          <p className="mt-3 max-w-4xl text-sm text-slate-300">Pricing authority records do not approve a model or authorize deployment. Governed PROJECT/PROJECT USD limits use exact canonical cost evidence only. Daily admission can stop new calls before provider execution. A per-request limit is evaluated after authoritative provider usage arrives, so it can block result consumption but cannot undo a provider charge already incurred. AI-system and agent cost limits fail closed until cost evidence carries those scope identities.</p>
        </section>
      </>}
    </div>
  </main>
}
