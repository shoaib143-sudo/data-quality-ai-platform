import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ClassificationLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('classification')
  return children
}
