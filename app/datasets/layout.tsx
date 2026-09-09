import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DatasetsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('datasets')
  return children
}
