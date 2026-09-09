import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'

export default async function ClassificationPrivacyLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('classification-privacy')
  return children
}
