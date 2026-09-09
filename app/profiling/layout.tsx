import type { ReactNode } from 'react'
import { requireWorkspaceAccess } from '@/lib/governance/workspace-access'
import ProfilingRunHistory from './profiling-run-history'

export default async function ProfilingLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceAccess('profiling')
  return <>
    {children}
    <ProfilingRunHistory />
  </>
}
