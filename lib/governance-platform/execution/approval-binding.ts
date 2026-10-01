export type GovernancePlanApprovalBinding={planId:string;planFingerprint:string;desiredStateFingerprint:string}

export function governancePlanApprovalParameters(binding:GovernancePlanApprovalBinding){
 return{
  governancePlanId:binding.planId,
  governancePlanFingerprint:binding.planFingerprint,
  desiredStateFingerprint:binding.desiredStateFingerprint,
 }
}

export function assertGovernancePlanApprovalBinding(approved:Record<string,unknown>,current:GovernancePlanApprovalBinding){
 if(String(approved.governancePlanId??'')!==current.planId)throw new Error('Approved governance plan does not match the current plan.')
 if(String(approved.governancePlanFingerprint??'')!==current.planFingerprint)throw new Error('Governance approval was invalidated because the execution plan changed.')
 if(String(approved.desiredStateFingerprint??'')!==current.desiredStateFingerprint)throw new Error('Governance approval was invalidated because desired state changed.')
}
