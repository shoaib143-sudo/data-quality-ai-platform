import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('dashboard')
  return children
}
