export type GovernanceEvidenceRecord={
  projectId:string
  planId:string
  deploymentId:string
  operationId:string
  provider:string
  connectionId:string
  idempotencyKey:string
  desiredStateFingerprint:string
  executionStatus:string
  verificationStatus:string|null
  providerObjectId:string|null
  providerJobId:string|null
  recordedAt:string
  details:Record<string,unknown>
}

export function governanceEvidence(input:Omit<GovernanceEvidenceRecord,'recordedAt'>):GovernanceEvidenceRecord{
  return {...input,recordedAt:new Date().toISOString()}
}
