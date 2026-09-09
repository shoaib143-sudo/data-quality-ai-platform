import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function SchedulesLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('schedules')
  return children
}
