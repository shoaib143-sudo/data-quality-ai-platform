'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function MonitoringError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Execution monitor unavailable" detail="Agent runs or diagnostic evidence could not be loaded. No execution lifecycle action was performed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}
