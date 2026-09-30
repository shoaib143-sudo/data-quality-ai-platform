export const workspaceNavItems = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Dashboard' },
  { href: '/catalog', label: 'Data catalog', shortLabel: 'Data' },
  { href: '/data-quality', label: 'Data quality', shortLabel: 'Quality' },
  { href: '/journeys', label: 'Governance', shortLabel: 'Governance' },
  { href: '/agents', label: 'AI agents', shortLabel: 'AI Agents' },
  { href: '/monitoring', label: 'Job monitor', shortLabel: 'Monitor' },
  { href: '/approvals', label: 'Approvals', shortLabel: 'Approvals' },
  { href: '/admin', label: 'Administration', shortLabel: 'Admin' },
] as const

export function isWorkspacePathActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
