import Link from 'next/link'
import { CircleSlash2, type LucideIcon } from 'lucide-react'

export function WorkspaceEmptyState({
  title,
  detail,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  headingLevel = 'h2',
  icon: Icon = CircleSlash2,
}: {
  title: string
  detail: string
  actionHref?: string
  actionLabel?: string
  secondaryHref?: string
  secondaryLabel?: string
  headingLevel?: 'h1' | 'h2'
  icon?: LucideIcon
}) {
  const hasPrimary = Boolean(actionHref && actionLabel)
  const hasSecondary = Boolean(secondaryHref && secondaryLabel)
  const Heading = headingLevel

  return (
    <section
      className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-10"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <Heading className="mt-4 text-xl font-black text-slate-950">{title}</Heading>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{detail}</p>
      {hasPrimary || hasSecondary ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hasPrimary ? (
            <Link
              href={actionHref!}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {actionLabel}
            </Link>
          ) : null}
          {hasSecondary ? (
            <Link
              href={secondaryHref!}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
