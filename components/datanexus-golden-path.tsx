import Link from 'next/link'

export const DATANEXUS_GOLDEN_PATH_STEPS = [
  { key: 'source', label: 'Source', href: '/datasets#connections' },
  { key: 'dataset', label: 'Dataset', href: '/datasets#datasets' },
  { key: 'profiling', label: 'Profiling', href: '/profiling' },
  { key: 'findings', label: 'Findings', href: '/profiling/explorer' },
  { key: 'score', label: 'Score', href: '/scorecards' },
  { key: 'governance', label: 'Governance', href: '/ai-insights' },
] as const

export type DataNexusGoldenPathStep = typeof DATANEXUS_GOLDEN_PATH_STEPS[number]['key']

export function DataNexusGoldenPath({
  activeStep,
  className = '',
}: {
  activeStep: DataNexusGoldenPathStep
  className?: string
}) {
  return (
    <nav
      aria-label="DataNexus Golden Path"
      className={`rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm ${className}`}
    >
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {DATANEXUS_GOLDEN_PATH_STEPS.map((step, index) => {
          const active = step.key === activeStep
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                aria-current={active ? 'step' : undefined}
                className={`flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active
                    ? 'bg-slate-950 font-semibold text-white shadow-sm'
                    : 'border border-slate-100 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${active
                    ? 'bg-white/15 text-white'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
                  }`}
                >
                  {index + 1}
                </span>
                <span>{step.label}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
