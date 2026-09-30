'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ClipboardCheck, Compass, Database, Layers3, Menu, Settings, ShieldCheck, Sparkles } from 'lucide-react'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: Layers3 },
  { href: '/catalog', label: 'Data catalog', icon: Database },
  { href: '/data-quality', label: 'Data quality', icon: ShieldCheck },
  { href: '/journeys', label: 'Governance', icon: Compass },
  { href: '/agents', label: 'AI agents', icon: Sparkles },
  { href: '/monitoring', label: 'Job monitor', icon: Activity },
  { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { href: '/admin', label: 'Administration', icon: Settings },
]

export function WorkspaceRail({ allowedHrefs, homeHref }: { allowedHrefs: string[]; homeHref: string }) {
  const pathname = usePathname()
  const visibleLinks = links.filter(item => allowedHrefs.includes(item.href))
  return <nav className="dn-app-rail" aria-label="Workspace navigation">
    <Link href={homeHref} className="dn-app-rail-brand" aria-label="DataNexus home">D<span>N</span></Link>
    <div className="dn-app-rail-links">{visibleLinks.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
      return <Link href={href} key={href} className={`dn-app-rail-link${active ? ' is-active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined} title={label}><Icon aria-hidden="true" /><span>{label}</span></Link>
    })}</div>
    <details className="dn-app-rail-menu" key={pathname}>
      <summary aria-label="Open workspace navigation"><Menu aria-hidden="true" /><span>Workspaces</span></summary>
      <div className="dn-app-rail-menu-list">{visibleLinks.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
        return <Link href={href} key={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''}><Icon aria-hidden="true" />{label}</Link>
      })}</div>
    </details>
  </nav>
}
