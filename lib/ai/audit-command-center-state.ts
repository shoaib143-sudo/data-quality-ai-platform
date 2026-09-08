export type AuditEventControlRow = {
  id: string
  project_id: string | null
  actor_user_id: string | null
  actor_type: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  correlation_id: string | null
  created_at: string
  previous_hash: string | null
  event_hash: string
  chain_version: number
  chain_sequence: number | string | null
}

export type AuditReportSnapshotControlRow = {
  id: string
  project_id: string
  report_type: string
  generated_by: string | null
  actor_ref: string | null
  actor_type: string
  chain_sequence: number | string
  chain_tip_event_id: string
  chain_tip_event_hash: string
  audit_event_count: number | string
  report_hash: string
  created_at: string
}

export type AuditChainVerification = {
  valid: boolean
  failures: number
  v2_failures: number
  legacy_failures: number
  strict_failures: number
  events_checked: number
  v2_events_checked: number
  legacy_events_checked: number
  strict_events_checked: number
  v2_forks_observed: number
  legacy_forks_observed: number
  chain_version: number
  verified_at: string
}

export type AuditCommandCenterPersistence = {
  listAuditEvents(projectId: string): Promise<AuditEventControlRow[]>
  listAuditReportSnapshots(projectId: string): Promise<AuditReportSnapshotControlRow[]>
  verifyAuditChain(projectId: string): Promise<AuditChainVerification>
}

export type AuditCommandCenterState = {
  projectId: string
  auditEvents: AuditEventControlRow[]
  auditReportSnapshots: AuditReportSnapshotControlRow[]
  chainVerification: AuditChainVerification
  counts: {
    visibleAuditEvents: number
    visibleAuditSnapshots: number
    visibleEventsMissingSequence: number
    visibleEventsMissingPreviousHash: number
  }
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export class GovernedAuditCommandCenterState {
  constructor(private readonly persistence: AuditCommandCenterPersistence) {}

  async read(projectIdInput: string): Promise<AuditCommandCenterState> {
    const projectId = requiredText(projectIdInput, 'projectId')
    const [eventsRaw, snapshotsRaw, chainVerification] = await Promise.all([
      this.persistence.listAuditEvents(projectId),
      this.persistence.listAuditReportSnapshots(projectId),
      this.persistence.verifyAuditChain(projectId),
    ])

    const auditEvents = eventsRaw.filter((row) => row.project_id === projectId)
    const auditReportSnapshots = snapshotsRaw.filter((row) => row.project_id === projectId)

    return {
      projectId,
      auditEvents,
      auditReportSnapshots,
      chainVerification,
      counts: {
        visibleAuditEvents: auditEvents.length,
        visibleAuditSnapshots: auditReportSnapshots.length,
        visibleEventsMissingSequence: auditEvents.filter((row) => row.chain_sequence == null).length,
        visibleEventsMissingPreviousHash: auditEvents.filter((row) => row.previous_hash == null).length,
      },
    }
  }
}