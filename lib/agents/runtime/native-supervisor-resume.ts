import { createAdminClient } from '@/lib/supabase/admin'
import { hashNativeRuntimeValue } from '@/lib/agents/runtime/native-tool-contracts'

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/

export type NativeSupervisorExecutionPins = {
  planHash: string
  runtimeManifestHash: string
  toolContractsHash: string
}

export type NativeSupervisorExecutionLease = {
  agent_run_id: string
  plan_hash: string
  runtime_manifest_hash: string
  tool_contracts_hash: string
  checkpoint_id: string | null
  execution_generation: number
  resume_attempt: number
  lease_owner: string | null
  lease_expires_at: string | null
}

function assertHash(value: string, label: string) {
  if (!SHA256_PATTERN.test(value)) throw new Error(`${label} must be a canonical sha256 digest`)
}

function assertLeaseOwner(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 300) throw new Error('leaseOwner must contain between 1 and 300 characters')
  return normalized
}

function assertLeaseSeconds(value: number) {
  if (!Number.isInteger(value) || value < 10 || value > 3600) {
    throw new Error('leaseSeconds must be an integer between 10 and 3600')
  }
}

export async function buildNativeSupervisorExecutionPins(input: {
  supervisorAgentRunId: string
  planHash: string
  bindings: Iterable<{
    stepId: string
    agentRunId: string
    manifestHash: string
    contractHash: string
    executorKey: string
  }>
}): Promise<NativeSupervisorExecutionPins> {
  assertHash(input.planHash, 'planHash')
  const admin = createAdminClient()
  const { data: manifest, error } = await admin
    .schema('agent')
    .from('agent_run_runtime_manifests')
    .select('manifest_hash')
    .eq('agent_run_id', input.supervisorAgentRunId)
    .maybeSingle()
  if (error || !manifest) {
    throw new Error(`Unable to load supervisor runtime manifest: ${error?.message ?? 'not found'}`)
  }

  const runtimeManifestHash = String(manifest.manifest_hash ?? '')
  assertHash(runtimeManifestHash, 'runtimeManifestHash')
  const toolContractsHash = hashNativeRuntimeValue(
    Array.from(input.bindings)
      .map((binding) => ({
        stepId: binding.stepId,
        agentRunId: binding.agentRunId,
        manifestHash: binding.manifestHash,
        contractHash: binding.contractHash,
        executorKey: binding.executorKey,
      }))
      .sort((left, right) => left.stepId.localeCompare(right.stepId)),
  )
  assertHash(toolContractsHash, 'toolContractsHash')
  return { planHash: input.planHash, runtimeManifestHash, toolContractsHash }
}

export async function initializeNativeSupervisorExecution(input: {
  agentRunId: string
  pins: NativeSupervisorExecutionPins
  checkpointId?: string | null
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('initialize_supervisor_execution_internal', {
    p_agent_run_id: input.agentRunId,
    p_plan_hash: input.pins.planHash,
    p_runtime_manifest_hash: input.pins.runtimeManifestHash,
    p_tool_contracts_hash: input.pins.toolContractsHash,
    p_checkpoint_id: input.checkpointId ?? null,
  })
  if (error || !data) throw new Error(`Unable to initialize durable supervisor execution: ${error?.message ?? 'invalid lease state'}`)
  return data as NativeSupervisorExecutionLease
}

export async function claimNativeSupervisorExecution(input: {
  agentRunId: string
  pins: NativeSupervisorExecutionPins
  leaseOwner: string
  leaseSeconds?: number
  checkpointId?: string | null
}) {
  const leaseOwner = assertLeaseOwner(input.leaseOwner)
  const leaseSeconds = input.leaseSeconds ?? 300
  assertLeaseSeconds(leaseSeconds)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('claim_supervisor_execution_internal', {
    p_agent_run_id: input.agentRunId,
    p_plan_hash: input.pins.planHash,
    p_runtime_manifest_hash: input.pins.runtimeManifestHash,
    p_tool_contracts_hash: input.pins.toolContractsHash,
    p_lease_owner: leaseOwner,
    p_lease_seconds: leaseSeconds,
    p_checkpoint_id: input.checkpointId ?? null,
  })
  if (error || !data) throw new Error(`Unable to claim durable supervisor execution: ${error?.message ?? 'invalid lease state'}`)
  return data as NativeSupervisorExecutionLease
}

export async function renewNativeSupervisorExecution(input: {
  agentRunId: string
  leaseOwner: string
  executionGeneration: number
  leaseSeconds?: number
}) {
  const leaseOwner = assertLeaseOwner(input.leaseOwner)
  const leaseSeconds = input.leaseSeconds ?? 300
  assertLeaseSeconds(leaseSeconds)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('renew_supervisor_execution_lease_internal', {
    p_agent_run_id: input.agentRunId,
    p_lease_owner: leaseOwner,
    p_execution_generation: input.executionGeneration,
    p_lease_seconds: leaseSeconds,
  })
  if (error || !data) throw new Error(`Unable to renew durable supervisor execution: ${error?.message ?? 'lease lost'}`)
  return data as NativeSupervisorExecutionLease
}

export async function releaseNativeSupervisorExecution(input: {
  agentRunId: string
  leaseOwner: string
  executionGeneration: number
  checkpointId?: string | null
}) {
  const leaseOwner = assertLeaseOwner(input.leaseOwner)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('release_supervisor_execution_lease_internal', {
    p_agent_run_id: input.agentRunId,
    p_lease_owner: leaseOwner,
    p_execution_generation: input.executionGeneration,
    p_checkpoint_id: input.checkpointId ?? null,
  })
  if (error || !data) throw new Error(`Unable to release durable supervisor execution: ${error?.message ?? 'lease lost'}`)
  return data as NativeSupervisorExecutionLease
}
