import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function CatalogLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('catalog')
  return children
}
