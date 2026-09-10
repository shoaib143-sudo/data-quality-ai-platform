import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function SearchLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('search')
  return children
}
