import Link from 'next/link'
import { Activity, ArrowRight, BellRing, Eye, Gauge, ShieldCheck, Sparkles } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'

export default async function ObservabilityPage() {
  await requireUser()

  return (
    <main className="min-h-screen p-5 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col gap-5 rounded-3xl border border-blue-100 bg-white/95 p-6 shadow-[0_18px_55px_rgba(37,99,235,0.09)] sm:p-8 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Executive summary</Link>
            <div className="mt-4 flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Activity className="h-6 w-6" /></span>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700"><Sparkles className="h-3.5 w-3.5" /> Operational visibility</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Data Observability</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Monitor whether governed data remains trustworthy over time, and surface changes before they become business problems.</p>
              </div>
            </div>
          </div>
          <Link href="/data-quality" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Review quality evidence <ArrowRight className="h-4 w-4" /></Link>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Eye className="h-5 w-5" /></span><h2 className="mt-4 font-bold">Continuous visibility</h2><p className="mt-2 text-sm leading-6 text-slate-600">Track changes in data quality, schema and profiling outcomes so teams can see when trust is improving or deteriorating.</p></div>
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><BellRing className="h-5 w-5" /></span><h2 className="mt-4 font-bold">Early warning</h2><p className="mt-2 text-sm leading-6 text-slate-600">Turn material changes into actionable signals before they affect reporting, customers, operations or compliance decisions.</p></div>
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Gauge className="h-5 w-5" /></span><h2 className="mt-4 font-bold">Business confidence</h2><p className="mt-2 text-sm leading-6 text-slate-600">Connect technical observations to business impact so governance teams can prioritise what matters most.</p></div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h2 className="text-xl font-bold">Observability foundation</h2>
              <p className="mt-1 text-sm text-slate-500">The workspace is protected and ready to connect to the persisted profiling and quality lifecycle.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['Quality score trends', 'Schema drift', 'Freshness signals', 'Business impact alerts'].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm font-semibold text-slate-700">{item}</div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
            <p className="text-sm font-bold text-blue-900">Current state</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">The monitoring surface is intentionally separated from profiling execution. Profiling produces the evidence, while observability will show how that evidence changes over time.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
