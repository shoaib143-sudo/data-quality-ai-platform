import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ExperienceReportsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('reports')
  return children
}
