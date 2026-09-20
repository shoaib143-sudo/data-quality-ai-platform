import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'

export type GoldenPathStep = 'SOURCE' | 'DATASET' | 'PROFILING' | 'FINDINGS' | 'SCORE' | 'GOVERNANCE'

const ORDER: GoldenPathStep[] = ['SOURCE', 'DATASET', 'PROFILING', 'FINDINGS', 'SCORE', 'GOVERNANCE']
const LABELS: Record<GoldenPathStep, string> = {
  SOURCE: 'Source',
  DATASET: 'Dataset',
  PROFILING: 'Profiling',
  FINDINGS: 'Findings',
  SCORE: 'Score',
  GOVERNANCE: 'Governance',
}

function params(input: Record<string, string | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) if (value) search.set(key, value)
  const query = search.toString()
  return query ? '?' + query : ''
}

function hrefFor(step: GoldenPathStep, context: {
  projectId?: string | null
  datasetId?: string | null
  runId?: string | null
  findingId?: string | null
}) {
  switch (step) {
    case 'SOURCE':
    case 'DATASET':
      return '/datasets' + params({ datasetId: context.datasetId })
    case 'PROFILING':
      return context.runId
        ? '/profiling' + params({ runId: context.runId })
        : '/profiling'
    case 'FINDINGS':
      return context.runId
        ? '/profiling/explorer' + params({ runId: context.runId, findingId: context.findingId })
        : '/profiling/explorer'
    case 'SCORE':
      return '/data-quality' + params({
        projectId: context.projectId,
        datasetId: context.datasetId,
        runId: context.runId,
      })
    case 'GOVERNANCE':
      return context.projectId && context.datasetId
        ? '/governance/dataset' + params({
            projectId: context.projectId,
            datasetId: context.datasetId,
            runId: context.runId,
            findingId: context.findingId,
          })
        : '/scorecards'
  }
}

export function GoldenPathNavigator({
  current,
  projectId = null,
  datasetId = null,
  runId = null,
  findingId = null,
  theme = 'light',
}: {
  current: GoldenPathStep
  projectId?: string | null
  datasetId?: string | null
  runId?: string | null
  findingId?: string | null
  theme?: 'light' | 'dark'
}) {
  const currentIndex = ORDER.indexOf(current)
  const dark = theme === 'dark'

  return (
    <nav
      aria-label="DataNexus Golden Path"
      className={
        'rounded-2xl border p-3 shadow-sm ' +
        (dark ? 'border-white/10 bg-[#0a1d33]' : 'border-slate-200 bg-white')
      }
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <p className={'text-[10px] font-black uppercase tracking-[0.16em] ' + (dark ? 'text-cyan-300' : 'text-blue-600')}>
            DataNexus Golden Path
          </p>
          <p className={'mt-0.5 text-xs ' + (dark ? 'text-slate-500' : 'text-slate-500')}>
            Follow the same dataset from onboarding through governed intelligence.
          </p>
        </div>
        {datasetId ? (
          <span className={'hidden max-w-44 truncate rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline ' + (
            dark ? 'bg-white/[0.06] text-slate-400' : 'bg-slate-100 text-slate-500'
          )}>
            Context locked
          </span>
        ) : null}
      </div>

      <div className="grid gap-1 sm:grid-cols-3 xl:grid-cols-6">
        {ORDER.map((step, index) => {
          const active = step === current
          const completed = index < currentIndex
          return (
            <Link
              key={step}
              href={hrefFor(step, { projectId, datasetId, runId, findingId })}
              aria-current={active ? 'step' : undefined}
              className={
                'group flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ' +
                (active
                  ? dark
                    ? 'bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30'
                    : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : dark
                    ? 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')
              }
            >
              {completed
                ? <CheckCircle2 className={'h-4 w-4 shrink-0 ' + (dark ? 'text-emerald-300' : 'text-emerald-600')} />
                : <Circle className={'h-4 w-4 shrink-0 ' + (active ? (dark ? 'text-cyan-300' : 'text-blue-600') : 'text-slate-400')} />}
              <span className="truncate">{LABELS[step]}</span>
              {active ? <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0" /> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
