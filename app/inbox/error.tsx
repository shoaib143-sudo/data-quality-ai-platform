'use client'

import { WorkspaceErrorState } from '@/components/app-shell/workspace-error'

export default function InboxError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceErrorState error={error} reset={reset} title="Governance inbox unavailable" detail="The combined action queue could not be loaded. Source workspaces remain available directly." fallbackHref="/dashboard" fallbackLabel="Return to dashboard" />
}
