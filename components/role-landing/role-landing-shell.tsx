'use client'

import Link from 'next/link'
import { ArrowRight, Bell, Search } from 'lucide-react'
import type { ReactNode } from 'react'

export type LandingMetric = {
  label: string
  value: string
  helper?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'
}

export type LandingSection = {
  title: string
  subtitle?: string
  content: ReactNode
}

type Props = {
  roleLabel: string
  eyebrow: string
  title: string
  subtitle: string
  metrics: LandingMetric[]
  sections: LandingSection[]
  primaryAction?: { label: string; href: string }
  secondaryAction?: { label: string; href: string }
}

const toneClass: Record<NonNullable<LandingMetric['tone']>, string> = {
  neutral: 'text-slate-900',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-rose-700',
  info: 'text-blue-700',
}

export function SoftCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-white/80 bg-[#eef3f9] shadow-[10px_10px_24px_rgba(148,163,184,0.22),_-10px_-10px_24px_rgba(255,255,255,0.9)] ${className}`}>{children}</div>
}

export function InsetPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-[#eef3f9] shadow-[inset_4px_4px_10px_rgba(148,163,184,0.18),_inset_-4px_-4px_10px_rgba(255,255,255,0.9)] ${className}`}>{children}</div>
}

export default function RoleLandingShell({ roleLabel, eyebrow, title, subtitle, metrics, sections, primaryAction, secondaryAction }: Props) {
  return (
    <main className="min-h-screen bg-[#eef3f9] text-slate-950">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef3f9] text-blue-700 shadow-[6px_6px_14px_rgba(148,163,184,0.24),_-6px_-6px_14px_rgba(255,255,255,0.9)]">
              <span className="text-lg font-black">DN</span>
            </div>
            <div>
              <div className="font-black tracking-tight">DataNexus</div>
              <div className="text-xs text-slate-500">Trusted data. Better decisions.</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-2xl bg-[#eef3f9] px-4 py-2 text-sm text-slate-500 shadow-[inset_3px_3px_8px_rgba(148,163,184,0.16),_inset_-3px_-3px_8px_rgba(255,255,255,0.85)] md:flex">
              <Search className="h-4 w-4" />
              Search DataNexus
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-2xl bg-[#eef3f9] text-slate-600 shadow-[5px_5px_12px_rgba(148,163,184,0.2),_-5px_-5px_12px_rgba(255,255,255,0.9)]" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{roleLabel}</span>
          </div>
        </header>

        <SoftCard className="overflow-hidden p-7 sm:p-9">
          <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
              <h1 className="mt-3 max-w-5xl text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{subtitle}</p>
            </div>
            {(primaryAction || secondaryAction) && <div className="flex flex-wrap gap-3">
              {secondaryAction && <Link href={secondaryAction.href} className="rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 shadow-[5px_5px_12px_rgba(148,163,184,0.2),_-5px_-5px_12px_rgba(255,255,255,0.9)]">{secondaryAction.label}</Link>}
              {primaryAction && <Link href={primaryAction.href} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-[6px_6px_16px_rgba(37,99,235,0.25),_-3px_-3px_10px_rgba(255,255,255,0.8)]">{primaryAction.label}<ArrowRight className="h-4 w-4" /></Link>}
            </div>}
          </div>
        </SoftCard>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => <SoftCard key={metric.label} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className={`mt-3 text-3xl font-black ${toneClass[metric.tone ?? 'neutral']}`}>{metric.value}</p>
            {metric.helper && <p className="mt-2 text-sm text-slate-500">{metric.helper}</p>}
          </SoftCard>)}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          {sections.map((section) => <SoftCard key={section.title} className="p-6 sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-black tracking-tight">{section.title}</h2>
              {section.subtitle && <p className="mt-1 text-sm text-slate-500">{section.subtitle}</p>}
            </div>
            {section.content}
          </SoftCard>)}
        </section>
      </div>
    </main>
  )
}
