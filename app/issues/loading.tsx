import { WorkspaceLoadingState } from '@/components/app-shell/workspace-state'

export default function IssuesLoading() {
  return <WorkspaceLoadingState title="Loading remediation workspace" detail="Retrieving governed issues, comments, ownership, and remediation evidence." />
}
