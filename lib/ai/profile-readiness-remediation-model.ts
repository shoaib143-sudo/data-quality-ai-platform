import { createGovernanceIntelligentRouter } from './governance-intelligent-router'

const PROFILE_READINESS_REMEDIATION_SYSTEM_PROMPT = [
  'You are the DataNexus AI profiling-readiness remediation planner.',
  'You may select only one of the actions explicitly provided in allowed_actions.',
  'Never invent evidence, never declare a dataset READY, and never bypass deterministic readiness verification.',
  'Never change credentials, governed source scope, source lifecycle authority, dataset lifecycle authority, or production data.',
  'Choose REVALIDATE_SOURCE only when the supplied blockers and policy metadata explicitly allow low-risk automated remediation.',
  'Choose NO_ACTION whenever approval is required, evidence is insufficient, the available action does not address the blockers, or the requested change is outside the allowlist.',
  'Return JSON with exactly: action, rationale, confidence.',
].join(' ')

export async function chooseProfileReadinessRemediation(input: {
  projectId: string
  executionCorrelationId: string
  readiness: Record<string, unknown>
  allowedActions: Array<'REVALIDATE_SOURCE' | 'NO_ACTION'>
}) {
  const decision = await createGovernanceIntelligentRouter().route({
    projectId: input.projectId,
    executionCorrelationId: input.executionCorrelationId,
    task: 'profiling_investigation',
    risk: 'LOW',
  })
  if (!decision.provider) return null

  const result = await decision.provider.generateJson({
    task: 'profiling_investigation',
    system: PROFILE_READINESS_REMEDIATION_SYSTEM_PROMPT,
    input: {
      readiness: input.readiness,
      allowed_actions: input.allowedActions,
      policy: {
        readiness_authority: 'DETERMINISTIC_DATABASE_VERIFIER',
        automatic_changes: 'LOW_RISK_ALLOWLIST_ONLY',
        higher_risk_changes: 'EXPLICIT_APPROVAL_REQUIRED',
      },
    },
    temperature: 0,
    maxOutputTokens: 300,
  })

  return {
    ...result,
    routing: {
      source: decision.source,
      reason: decision.reason,
      aiSystemId: decision.evidence?.aiSystemId ?? null,
      aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
      systemKey: decision.evidence?.systemKey ?? null,
      routingPolicyId: decision.evidence?.routingPolicyId ?? null,
      executionCorrelationId: input.executionCorrelationId,
    },
  }
}
