import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ObservabilityLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('observability')
  return children
}
