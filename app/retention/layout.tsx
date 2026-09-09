import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function RetentionLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('retention')
  return children
}
