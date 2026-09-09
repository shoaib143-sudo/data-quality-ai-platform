import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DataQualityLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('data-quality')
  return children
}
