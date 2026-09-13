import Link from 'next/link'
import { Activity, Bell, Compass, Database, Layers3, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { SkipToContent } from '@/components/app-shell/skip-to-content'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-policy'
import type { PersonaSlug } from '@/lib/governance/personas'

type Props = {
  roleLabel?: string
  contextLabel?: string
  homeHref?: string
  persona?: PersonaSlug
  organizationRole?: string | null
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layers3 },
  { href: '/journeys', label: 'Journey', icon: Compass },
  { href: '/catalog', label: 'Catalog', icon: Database },
  { href: '/data-quality', label: 'Quality', icon: ShieldCheck },
  { href: '/monitoring', label: 'Job Monitor', icon: Activity },
  { href: '/agents', label: 'Agents', icon: Sparkles },
]

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'

export function GlobalUtilityBar({
  roleLabel,
  contextLabel = 'Current project',
  homeHref,
  persona,
  organizationRole,
}: Props) {
  const resolvedHomeHref = homeHref ?? (persona && !canAccessWorkspaceHref(persona, '/dashboard', organizationRole) ? '/home' : '/dashboard')
  const visibleNavItems = persona ? navItems.filter(item => canAccessWorkspaceHref(persona, item.href, organizationRole)) : navItems

  return (
    <>
      <SkipToContent />
      <header className="dn-topbar mb-6 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={resolvedHomeHref} className={`flex min-w-0 items-center gap-3 rounded-xl ${focus}`} aria-label="DataNexus home">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 font-black text-white shadow-[0_8px_22px_rgba(37,99,235,.24)]">DN</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-white">DataNexus AI</span>
              <span className="block truncate text-xs text-slate-500">{contextLabel}</span>
            </span>
          </Link>

          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Primary">
            {visibleNavItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-400 hover:bg-white/[0.05] hover:text-white ${focus}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 pr-12">
            {(!persona || canAccessWorkspaceHref(persona, '/search', organizationRole)) ? (
              <Link href="/search" className={`dn-control inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-300 hover:text-white ${focus}`} aria-label="Search DataNexus">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">Search</span>
              </Link>
            ) : null}
            {(!persona || canAccessWorkspaceHref(persona, '/inbox', organizationRole)) ? (
              <Link href="/inbox" className={`dn-control inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-300 hover:text-white ${focus}`} aria-label="Open governance inbox">
                <Bell className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">Inbox</span>
              </Link>
            ) : null}
            {roleLabel ? <span className="rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-200">{roleLabel}</span> : null}
          </div>
        </div>
      </header>
    </>
  )
}
