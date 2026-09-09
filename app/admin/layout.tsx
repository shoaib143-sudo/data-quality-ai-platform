import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('admin')
  return children
}
