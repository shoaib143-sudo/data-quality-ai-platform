import type { ReasoningTask } from './reasoning-provider'

export type ReasoningOutputValidationIssue = {
  code: string
  path: string
}

export type ReasoningTaskContract = {
  contractId: string
  contractVersion: string
  validatorVersion: string
  requiredTopLevelKeys: readonly string[]
  maxOutputBytes: number
  maxDepth: number
  evidencePolicy: {
    requireExecutionCorrelationId: boolean
    preserveRawOutput: false
    recordValidationEvidence: true
  }
}

export type ReasoningOutputValidation = {
  valid: boolean
  contractId: string
  contractVersion: string
  validatorVersion: string
  outputBytes: number
  issues: ReasoningOutputValidationIssue[]
}

const BASELINE_MAX_OUTPUT_BYTES = 256_000
const BASELINE_MAX_DEPTH = 12

const CONTRACTS: Record<ReasoningTask, ReasoningTaskContract> = {
  profiling_investigation: {
    contractId: 'datanexus.profiling-investigation.output',
    contractVersion: '1',
    validatorVersion: '1',
    requiredTopLevelKeys: [
      'executive_summary',
      'probable_root_causes',
      'business_issue',
      'business_impact',
      'risk',
      'recommendations',
      'confidence',
      'evidence_gaps',
    ],
    maxOutputBytes: BASELINE_MAX_OUTPUT_BYTES,
    maxDepth: BASELINE_MAX_DEPTH,
    evidencePolicy: {
      requireExecutionCorrelationId: true,
      preserveRawOutput: false,
      recordValidationEvidence: true,
    },
  },
  governance_reasoning: {
    contractId: 'datanexus.governance-reasoning.output',
    contractVersion: '1',
    validatorVersion: '1',
    requiredTopLevelKeys: [],
    maxOutputBytes: BASELINE_MAX_OUTPUT_BYTES,
    maxDepth: BASELINE_MAX_DEPTH,
    evidencePolicy: {
      requireExecutionCorrelationId: true,
      preserveRawOutput: false,
      recordValidationEvidence: true,
    },
  },
  incident_investigation: {
    contractId: 'datanexus.incident-investigation.output',
    contractVersion: '1',
    validatorVersion: '1',
    requiredTopLevelKeys: [],
    maxOutputBytes: BASELINE_MAX_OUTPUT_BYTES,
    maxDepth: BASELINE_MAX_DEPTH,
    evidencePolicy: {
      requireExecutionCorrelationId: true,
      preserveRawOutput: false,
      recordValidationEvidence: true,
    },
  },
  general: {
    contractId: 'datanexus.general-reasoning.output',
    contractVersion: '1',
    validatorVersion: '1',
    requiredTopLevelKeys: [],
    maxOutputBytes: BASELINE_MAX_OUTPUT_BYTES,
    maxDepth: BASELINE_MAX_DEPTH,
    evidencePolicy: {
      requireExecutionCorrelationId: true,
      preserveRawOutput: false,
      recordValidationEvidence: true,
    },
  },
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function inspectJsonValue(
  value: unknown,
  path: string,
  depth: number,
  maxDepth: number,
  issues: ReasoningOutputValidationIssue[],
) {
  if (depth > maxDepth) {
    issues.push({ code: 'MAX_DEPTH_EXCEEDED', path })
    return
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issues.push({ code: 'NON_FINITE_NUMBER', path })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectJsonValue(entry, `${path}[${index}]`, depth + 1, maxDepth, issues))
    return
  }
  if (objectRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      inspectJsonValue(entry, `${path}.${key}`, depth + 1, maxDepth, issues)
    }
    return
  }
  issues.push({ code: 'NON_JSON_VALUE', path })
}

function validateProfilingInvestigation(output: Record<string, unknown>, issues: ReasoningOutputValidationIssue[]) {
  if (!Array.isArray(output.probable_root_causes)) issues.push({ code: 'EXPECTED_ARRAY', path: '$.probable_root_causes' })
  if (!Array.isArray(output.recommendations)) {
    issues.push({ code: 'EXPECTED_ARRAY', path: '$.recommendations' })
  } else {
    output.recommendations.forEach((entry, index) => {
      if (!objectRecord(entry)) {
        issues.push({ code: 'EXPECTED_OBJECT', path: `$.recommendations[${index}]` })
        return
      }
      for (const key of ['action', 'priority', 'approval_required', 'rationale']) {
        if (!(key in entry)) issues.push({ code: 'MISSING_REQUIRED_FIELD', path: `$.recommendations[${index}].${key}` })
      }
    })
  }
  if (!Array.isArray(output.evidence_gaps)) issues.push({ code: 'EXPECTED_ARRAY', path: '$.evidence_gaps' })
  if (typeof output.confidence !== 'number' || !Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) {
    issues.push({ code: 'INVALID_CONFIDENCE', path: '$.confidence' })
  }
}

export function reasoningTaskContract(task: ReasoningTask): ReasoningTaskContract {
  return CONTRACTS[task]
}

export function validateReasoningOutput(task: ReasoningTask, output: unknown): ReasoningOutputValidation {
  const contract = reasoningTaskContract(task)
  const issues: ReasoningOutputValidationIssue[] = []
  let outputBytes = 0

  if (!objectRecord(output)) {
    issues.push({ code: 'EXPECTED_OBJECT', path: '$' })
  } else {
    for (const key of contract.requiredTopLevelKeys) {
      if (!(key in output)) issues.push({ code: 'MISSING_REQUIRED_FIELD', path: `$.${key}` })
    }
    inspectJsonValue(output, '$', 0, contract.maxDepth, issues)
    if (task === 'profiling_investigation') validateProfilingInvestigation(output, issues)
    try {
      outputBytes = Buffer.byteLength(JSON.stringify(output), 'utf8')
    } catch {
      issues.push({ code: 'NOT_SERIALIZABLE', path: '$' })
    }
  }

  if (outputBytes > contract.maxOutputBytes) issues.push({ code: 'OUTPUT_TOO_LARGE', path: '$' })

  return {
    valid: issues.length === 0,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    validatorVersion: contract.validatorVersion,
    outputBytes,
    issues,
  }
}

export class ReasoningOutputValidationError extends Error {
  readonly validation: ReasoningOutputValidation

  constructor(validation: ReasoningOutputValidation) {
    super(`Reasoning output failed ${validation.contractId}@${validation.contractVersion}: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(', ')}`)
    this.name = 'ReasoningOutputValidationError'
    this.validation = validation
  }
}

export function assertValidReasoningOutput(task: ReasoningTask, output: unknown) {
  const validation = validateReasoningOutput(task, output)
  if (!validation.valid) throw new ReasoningOutputValidationError(validation)
  return validation
}
