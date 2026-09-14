import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import './job-monitor-radial-topology.css'
import './job-monitor-final-topology.css'

export default async function MonitoringLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('monitoring')
  return children
}
