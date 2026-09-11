'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function WorkflowsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Governance workflows unavailable" detail="Workflow instances or approval evidence could not be loaded. No workflow decision was changed." fallbackHref="/inbox" fallbackLabel="Open governance inbox" />
}
