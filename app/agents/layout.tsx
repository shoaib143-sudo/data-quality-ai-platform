import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function AgentsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('agents')
  return children
}
