import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function StewardshipLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('stewardship')
  return children
}
