import Link from 'next/link'
import { Activity, Bell, ClipboardCheck, Compass, Database, Layers3, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react'
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
  { href: '/catalog', label: 'Data', icon: Database },
  { href: '/data-quality', label: 'Quality', icon: ShieldCheck },
  { href: '/journeys', label: 'Governance', icon: Compass },
  { href: '/agents', label: 'Automation', icon: Sparkles },
  { href: '/monitoring', label: 'Monitor', icon: Activity },
  { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { href: '/admin', label: 'Admin', icon: Settings },
]

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b17]'

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
      <SkipToContent targetId="workspace-content-start" />
      <header className="dn-topbar mb-3 px-3 py-2 sm:px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={resolvedHomeHref} className={`flex min-w-0 items-center gap-2 rounded-lg ${focus}`} aria-label="DataNexus home">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-600 text-xs font-black text-white shadow-[0_0_20px_rgba(34,211,238,.16)]">DN</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black tracking-tight text-white">DataNexus AI</span>
              <span className="block truncate text-[11px] leading-4 text-slate-500">{contextLabel}</span>
            </span>
          </Link>

          <nav className="order-3 flex w-full gap-0.5 overflow-x-auto sm:order-none sm:w-auto" aria-label="Primary">
            {visibleNavItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-cyan-300/[0.06] hover:text-cyan-100 hover:shadow-[0_0_14px_rgba(34,211,238,.05)] ${focus}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 pr-12">
            {(!persona || canAccessWorkspaceHref(persona, '/search', organizationRole)) ? (
              <Link href="/search" className={`dn-control inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-cyan-100 ${focus}`} aria-label="Search DataNexus">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Search</span>
              </Link>
            ) : null}
            {(!persona || canAccessWorkspaceHref(persona, '/inbox', organizationRole)) ? (
              <Link href="/inbox" className={`dn-control inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-cyan-100 ${focus}`} aria-label="Open governance inbox">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Inbox</span>
              </Link>
            ) : null}
            {roleLabel ? <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[11px] font-bold text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,.05)]">{roleLabel}</span> : null}
          </div>
        </div>
      </header>
      <div id="workspace-content-start" tabIndex={-1} className="scroll-mt-4" />
    </>
  )
}