import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function GlossaryLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('glossary')
  return children
}
