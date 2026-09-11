import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function WorkflowsLoading() {
  return <WorkspaceLoadingState title="Loading governance workflows" detail="Retrieving governed workflow instances, approvals, outcomes, and learning evidence." />
}
