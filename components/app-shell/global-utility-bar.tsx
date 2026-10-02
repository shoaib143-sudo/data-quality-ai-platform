'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Bell, ClipboardCheck, Compass, Database, Layers3, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { SkipToContent } from '@/components/app-shell/skip-to-content'
import { WorkspaceRail } from '@/components/app-shell/workspace-rail'
import { isWorkspacePathActive, workspaceNavItems } from '@/components/app-shell/workspace-navigation'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-policy'
import type { PersonaSlug } from '@/lib/governance/personas'

type Props = {
  roleLabel?: string
  contextLabel?: string
  homeHref?: string
  persona?: PersonaSlug
  organizationRole?: string | null
}

const icons = {
  '/dashboard': Layers3,
  '/catalog': Database,
  '/data-quality': ShieldCheck,
  '/journeys': Compass,
  '/agents': Sparkles,
  '/monitoring': Activity,
  '/approvals': ClipboardCheck,
  '/admin': Settings,
} as const

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b17]'

export function GlobalUtilityBar({
  roleLabel,
  contextLabel = 'Current project',
  homeHref,
  persona,
  organizationRole,
}: Props) {
  const pathname = usePathname()
  const resolvedHomeHref = homeHref ?? (persona && !canAccessWorkspaceHref(persona, '/dashboard', organizationRole) ? '/home' : '/dashboard')
  const visibleNavItems = persona ? workspaceNavItems.filter(item => canAccessWorkspaceHref(persona, item.href, organizationRole)) : workspaceNavItems
  const searchActive = isWorkspacePathActive(pathname, '/search')
  const inboxActive = isWorkspacePathActive(pathname, '/inbox')

  return (
    <>
      <SkipToContent targetId="workspace-content-start" />
      <WorkspaceRail allowedHrefs={visibleNavItems.map(item => item.href)} homeHref={resolvedHomeHref} />
      <header className="dn-topbar sticky top-2 z-50 mb-3 px-3 py-2 sm:px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={resolvedHomeHref} className={`flex min-w-0 items-center gap-2 rounded-lg ${focus}`} aria-label="DataNexus home">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-slate-700 via-blue-700 to-violet-700 text-xs font-black text-white shadow-[5px_5px_12px_rgba(2,8,18,.22),-2px_-2px_8px_rgba(39,64,91,.06)]">DN</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-black tracking-tight text-white">DataNexus AI</span>
              <span className="block truncate text-[11px] leading-4 text-slate-500">{contextLabel}</span>
            </span>
          </Link>

          <nav className="dn-topbar-primary order-3 flex w-full gap-0.5 overflow-x-auto sm:order-none sm:w-auto" aria-label="Primary">
            {visibleNavItems.map(({ href, shortLabel }) => {
              const Icon = icons[href]
              const active = isWorkspacePathActive(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  data-workspace-current={active ? 'true' : undefined}
                  className={`dn-topbar-link inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-cyan-300/[0.06] hover:text-cyan-100 ${active ? 'is-active' : ''} ${focus}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {shortLabel}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-1.5 pr-12">
            {(!persona || canAccessWorkspaceHref(persona, '/search', organizationRole)) ? (
              <Link href="/search" aria-current={searchActive ? 'page' : undefined} className={`dn-control dn-utility-link inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-cyan-100 ${searchActive ? 'is-active' : ''} ${focus}`} aria-label="Search DataNexus">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Search</span>
              </Link>
            ) : null}
            {(!persona || canAccessWorkspaceHref(persona, '/inbox', organizationRole)) ? (
              <Link href="/inbox" aria-current={inboxActive ? 'page' : undefined} className={`dn-control dn-utility-link inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-cyan-100 ${inboxActive ? 'is-active' : ''} ${focus}`} aria-label="Open governance inbox">
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Inbox</span>
              </Link>
            ) : null}
            {roleLabel ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-slate-300">{roleLabel}</span> : null}
          </div>
        </div>
      </header>
      <div id="workspace-content-start" tabIndex={-1} className="scroll-mt-4" />
    </>
  )
}
