'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ClipboardCheck, Compass, Database, Layers3, Menu, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { isWorkspacePathActive, workspaceNavItems } from '@/components/app-shell/workspace-navigation'

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

export function WorkspaceRail({ allowedHrefs, homeHref }: { allowedHrefs: string[]; homeHref: string }) {
  const pathname = usePathname()
  const visibleLinks = workspaceNavItems.filter(item => allowedHrefs.includes(item.href))

  return <nav className="dn-app-rail" aria-label="Workspace navigation">
    <Link href={homeHref} className="dn-app-rail-brand" aria-label="DataNexus home">D<span>N</span></Link>
    <div className="dn-app-rail-links">{visibleLinks.map(({ href, label }) => {
      const Icon = icons[href]
      const active = isWorkspacePathActive(pathname, href)
      return <Link
        href={href}
        key={href}
        className={`dn-app-rail-link${active ? ' is-active' : ''}`}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-workspace-current={active ? 'true' : undefined}
        title={label}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </Link>
    })}</div>
    <details className="dn-app-rail-menu" key={pathname}>
      <summary aria-label="Open workspace navigation" aria-haspopup="menu"><Menu aria-hidden="true" /><span>Workspaces</span></summary>
      <div className="dn-app-rail-menu-list" role="menu">{visibleLinks.map(({ href, label }) => {
        const Icon = icons[href]
        const active = isWorkspacePathActive(pathname, href)
        return <Link
          href={href}
          key={href}
          role="menuitem"
          aria-current={active ? 'page' : undefined}
          className={active ? 'is-active' : ''}
        >
          <Icon aria-hidden="true" />{label}
        </Link>
      })}</div>
    </details>
  </nav>
}
