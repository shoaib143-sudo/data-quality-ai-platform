import { createAdminClient } from '@/lib/supabase/admin'
import {
  GovernedAuditCommandCenterState,
  type AuditCommandCenterPersistence,
  type AuditChainVerification,
} from './audit-command-center-state'

function normalizeVerification(value: unknown): AuditChainVerification {
  const row = (value ?? {}) as Partial<AuditChainVerification>
  return {
    valid: row.valid === true,
    failures: Number(row.failures ?? 0),
    v2_failures: Number(row.v2_failures ?? 0),
    legacy_failures: Number(row.legacy_failures ?? 0),
    strict_failures: Number(row.strict_failures ?? 0),
    events_checked: Number(row.events_checked ?? 0),
    v2_events_checked: Number(row.v2_events_checked ?? 0),
    legacy_events_checked: Number(row.legacy_events_checked ?? 0),
    strict_events_checked: Number(row.strict_events_checked ?? 0),
    v2_forks_observed: Number(row.v2_forks_observed ?? 0),
    legacy_forks_observed: Number(row.legacy_forks_observed ?? 0),
    chain_version: Number(row.chain_version ?? 0),
    verified_at: String(row.verified_at ?? ''),
  }
}

export function createGovernanceAuditCommandCenterState() {
  const supabase = createAdminClient()

  const persistence: AuditCommandCenterPersistence = {
    async listAuditEvents(projectId) {
      const { data, error } = await supabase.schema('governance').from('audit_events')
        .select('id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,correlation_id,created_at,previous_hash,event_hash,chain_version,chain_sequence')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read governance audit events: ${error.message}`)
      return data ?? []
    },
    async listAuditReportSnapshots(projectId) {
      const { data, error } = await supabase.schema('governance').from('audit_report_snapshots')
        .select('id,project_id,report_type,generated_by,actor_ref,actor_type,chain_sequence,chain_tip_event_id,chain_tip_event_hash,audit_event_count,report_hash,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(50)
      if (error) throw new Error(`Unable to read governance audit report snapshots: ${error.message}`)
      return data ?? []
    },
    async verifyAuditChain(projectId) {
      const { data, error } = await supabase.schema('governance').rpc('verify_audit_chain', { p_project_id: projectId })
      if (error) throw new Error(`Unable to verify governance audit chain: ${error.message}`)
      return normalizeVerification(data)
    },
  }

  return new GovernedAuditCommandCenterState(persistence)
}