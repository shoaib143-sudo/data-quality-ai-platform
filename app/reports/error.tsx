'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function ReportsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Governance reports unavailable" detail="Reporting evidence could not be loaded completely. No governance or project state was changed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}
