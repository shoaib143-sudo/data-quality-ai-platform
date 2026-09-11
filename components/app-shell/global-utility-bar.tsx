import Link from 'next/link'
import { Bell, Database, Layers3, Search, ShieldCheck, Sparkles } from 'lucide-react'

type Props = {
  roleLabel?: string
  contextLabel?: string
  homeHref?: string
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layers3 },
  { href: '/catalog', label: 'Catalog', icon: Database },
  { href: '/data-quality', label: 'Quality', icon: ShieldCheck },
  { href: '/agents', label: 'Agents', icon: Sparkles },
]

export function GlobalUtilityBar({
  roleLabel,
  contextLabel = 'Current project',
  homeHref = '/dashboard',
}: Props) {
  return (
    <header className="mb-6 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3" aria-label="DataNexus home">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 font-black text-white shadow-sm">DN</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight text-slate-950">DataNexus</span>
            <span className="block truncate text-xs text-slate-500">{contextLabel}</span>
          </span>
        </Link>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Primary">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Search DataNexus"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Search</span>
          </Link>
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Open governance inbox"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">Inbox</span>
          </Link>
          {roleLabel ? (
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{roleLabel}</span>
          ) : null}
        </div>
      </div>
    </header>
  )
}
