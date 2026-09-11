import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function InboxLoading() {
  return <WorkspaceLoadingState title="Loading governance inbox" detail="Collecting approvals, issues, alerts, and execution evidence you can access." />
}
