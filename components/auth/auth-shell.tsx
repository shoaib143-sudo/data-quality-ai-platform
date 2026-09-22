import type { ReactNode } from 'react'
import { Database, ShieldCheck, Sparkles } from 'lucide-react'

export const authFieldClass =
  'mt-2 w-full rounded-xl border border-white/10 bg-[#0d1c30] px-3.5 py-3 text-sm text-slate-100 shadow-[inset_3px_3px_8px_rgba(2,8,18,.24),inset_-2px_-2px_7px_rgba(39,64,91,.04)] outline-none placeholder:text-slate-600 focus:border-sky-300/30'

export const authPrimaryButtonClass =
  'w-full rounded-xl border border-white/10 bg-gradient-to-r from-blue-700 to-violet-700 px-4 py-3 text-sm font-bold text-white shadow-[7px_7px_18px_rgba(2,8,18,.26),-3px_-3px_10px_rgba(39,64,91,.05)] hover:-translate-y-0.5 hover:from-blue-600 hover:to-violet-600 disabled:translate-y-0 disabled:opacity-50'

export const authSecondaryButtonClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-slate-200 shadow-[5px_5px_14px_rgba(2,8,18,.18),-2px_-2px_8px_rgba(39,64,91,.035)] hover:border-sky-300/20 hover:bg-white/[0.06] disabled:opacity-50'

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[26px] border border-white/10 bg-[#102036]/88 shadow-[18px_18px_46px_rgba(2,8,18,.34),-8px_-8px_26px_rgba(39,64,91,.055)] backdrop-blur-xl lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden overflow-hidden border-r border-white/[0.07] p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-sky-400/[0.07] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-violet-400/[0.06] blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 text-sm font-black tracking-tight text-white"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-slate-700 via-blue-700 to-violet-700">DN</span>DataNexus AI</div>
            <p className="mt-12 text-xs font-black uppercase tracking-[.18em] text-sky-300/80">Governed intelligence workspace</p>
            <h2 className="mt-3 max-w-md text-3xl font-black leading-tight text-white">Trust the data. Understand the evidence. Govern the action.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">A connected data-governance experience for discovery, quality, lineage, remediation and governed AI execution.</p>
          </div>
          <div className="relative grid gap-3">
            {[
              [Database, 'Object-centered Data 360'],
              [ShieldCheck, 'Evidence-backed governance'],
              [Sparkles, 'Policy-aware AI assistance'],
            ].map(([Icon,label]) => {
              const ItemIcon = Icon as typeof Database
              return <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] text-sky-200"><ItemIcon className="h-4 w-4"/></span><span className="text-sm font-semibold text-slate-300">{String(label)}</span></div>
            })}
          </div>
        </aside>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-7">
              <p className="text-xs font-black uppercase tracking-[.16em] text-sky-300">{eyebrow}</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
