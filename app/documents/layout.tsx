import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function DocumentsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('documents')
  return children
}
