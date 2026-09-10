import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ObservabilitySettingsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('observability-manage')
  return children
}
