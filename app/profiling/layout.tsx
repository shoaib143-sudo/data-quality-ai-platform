import type { ReactNode } from 'react'
import ProfilingRunHistory from './profiling-run-history'

export default function ProfilingLayout({ children }: { children: ReactNode }) {
  return <>
    {children}
    <ProfilingRunHistory />
  </>
}
