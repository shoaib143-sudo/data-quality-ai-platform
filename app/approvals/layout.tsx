import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ApprovalsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('approvals')
  return children
}
