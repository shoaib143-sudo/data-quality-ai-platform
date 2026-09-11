'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function IssuesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Remediation workspace unavailable" detail="Issues or supporting governance evidence could not be loaded. No remediation data was changed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}
