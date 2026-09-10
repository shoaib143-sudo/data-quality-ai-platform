import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DiscoveryLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('discovery')
  return children
}
