import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import '../reporting-light.css'

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('reports')
  return children
}
