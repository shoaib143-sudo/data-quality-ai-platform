import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ResourceAccessLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('platform')
  return children
}
