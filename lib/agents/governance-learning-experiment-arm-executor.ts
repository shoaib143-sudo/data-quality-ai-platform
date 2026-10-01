import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceIntelligentRouter } from '@/lib/ai/governance-intelligent-router'
import type { LearningExperimentQuoteProvider } from '@/lib/ai/learning-experiment-budget'
import type { ReasoningRequest } from '@/lib/ai/reasoning-provider'
import type {
  LearningExperimentArmExecutor,
  LearningExperimentArmExecution,
} from './governed-learning-experiment-runner'

export type GovernedLearningExperimentRequestFactory = {
  build(input: {
    projectId: string
    policyRecordId: string
    candidateId: string
    experimentRunId: string
    attemptId: string
    executionCorrelationId: string
    caseKey: string
    sourceCaseRef: string
    inputArtifactRef: string
    inputArtifactHash: string
    arm: 'BASELINE' | 'CANDIDATE'
    version: string
    executableArtifactRef: string
    executableArtifactHash: string
    payload: unknown
  }): Promise<{
    request: ReasoningRequest
    verifiedExecutableArtifactHash: string
    verifiedInputArtifactHash: string
    agentDefinitionId?: string | null
  }>
}

export type GovernedLearningExperimentOutputWriter = {
  persist(input: {
    projectId: string
    experimentRunId: string
    attemptId: string
    caseKey: string
    arm: 'BASELINE' | 'CANDIDATE'
    version: string
    providerId: string
    modelName: string
    result: Record<string, unknown>
  }): Promise<{ artifactRef: string; artifactHash: string }>
}

const SHA256 = /^sha256:[a-f0-9]{64}$/

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export function createGovernedLearningExperimentArmExecutor(input: {
  quote: LearningExperimentQuoteProvider
  requestFactory: GovernedLearningExperimentRequestFactory
  outputWriter: GovernedLearningExperimentOutputWriter
}): LearningExperimentArmExecutor {
  if (!input.quote || !input.requestFactory || !input.outputWriter) {
    throw new Error('governed learning experiment execution dependencies are required')
  }
  const admin = createAdminClient()
  const router = createGovernanceIntelligentRouter({ learningExperimentQuote: input.quote })

  return {
    async execute(execution) {
      const projectId = required(execution.projectId, 'projectId')
      const policyRecordId = required(execution.policyRecordId, 'policyRecordId')
      const candidateId = required(execution.candidateId, 'candidateId')
      const version = required(execution.version, 'version')
      const executableArtifactHash = required(execution.executableArtifactHash, 'executableArtifactHash')
      if (!SHA256.test(executableArtifactHash)) throw new Error('executableArtifactHash must be sha256')

      const { data: policy, error } = await admin.schema('agent')
        .from('learning_evaluation_policies')
        .select('id,project_id,candidate_id,agent_key,mode,baseline_version,candidate_version')
        .eq('id', policyRecordId)
        .eq('project_id', projectId)
        .eq('candidate_id', candidateId)
        .maybeSingle()
      if (error) throw new Error(`Unable to resolve locked learning evaluation policy: ${error.message}`)
      if (!policy) throw new Error('Locked learning evaluation policy was not found')
      const expectedVersion = execution.arm === 'BASELINE'
        ? String(policy.baseline_version)
        : String(policy.candidate_version)
      if (version !== expectedVersion) throw new Error('Learning experiment arm version does not match locked policy')

      const built = await input.requestFactory.build({
        projectId,
        policyRecordId,
        candidateId,
        experimentRunId: execution.experimentRunId,
        attemptId: execution.attemptId,
        executionCorrelationId: execution.executionCorrelationId,
        caseKey: execution.caseKey,
        sourceCaseRef: execution.sourceCaseRef,
        inputArtifactRef: execution.inputArtifactRef,
        inputArtifactHash: execution.inputArtifactHash,
        arm: execution.arm,
        version,
        executableArtifactRef: execution.executableArtifactRef,
        executableArtifactHash,
        payload: execution.payload,
      })
      if (!built || !built.request) throw new Error('Learning experiment request factory returned no request')
      if (built.verifiedExecutableArtifactHash !== executableArtifactHash) {
        throw new Error('Loaded executable artifact does not match immutable experiment attempt hash')
      }
      if (!SHA256.test(built.verifiedExecutableArtifactHash)) {
        throw new Error('Verified executable artifact hash must be sha256')
      }
      if (built.verifiedInputArtifactHash !== execution.inputArtifactHash || !SHA256.test(built.verifiedInputArtifactHash)) {
        throw new Error('Loaded input artifact does not match immutable experiment attempt hash')
      }

      const decision = await router.route({
        projectId,
        task: built.request.task,
        signal: execution.signal,
        executionCorrelationId: execution.executionCorrelationId,
        agentDefinitionId: built.agentDefinitionId ?? null,
        learningExperiment: {
          policyId: policyRecordId,
          candidateId,
          runId: execution.executionCorrelationId,
          agentKey: policy.agent_key,
          mode: policy.mode,
        },
      })
      if (decision.source === 'UNAVAILABLE' || !decision.provider) {
        return {
          terminalStatus: 'POLICY_BLOCKED',
          failureCode: decision.reason,
        } satisfies LearningExperimentArmExecution
      }

      const result = await decision.provider.generateJson({
        ...built.request,
        signal: execution.signal,
        allowFallback: false,
      })
      const artifact = await input.outputWriter.persist({
        projectId,
        experimentRunId: execution.experimentRunId,
        attemptId: execution.attemptId,
        caseKey: execution.caseKey,
        arm: execution.arm,
        version,
        providerId: result.provider,
        modelName: result.model,
        result: result.result,
      })
      if (!artifact || !required(artifact.artifactRef, 'outputArtifactRef') || !SHA256.test(required(artifact.artifactHash, 'outputArtifactHash'))) {
        throw new Error('Canonical output artifact writer returned invalid evidence')
      }
      return {
        terminalStatus: 'SUCCEEDED',
        outputArtifactRef: artifact.artifactRef,
        outputArtifactHash: artifact.artifactHash,
        observedLatencyMs: result.latencyMs,
      }
    },
  }
}
