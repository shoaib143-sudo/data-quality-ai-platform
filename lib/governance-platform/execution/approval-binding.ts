export type GovernancePlanApprovalBinding={planId:string;desiredStateFingerprint:string}

export function governancePlanApprovalParameters(binding:GovernancePlanApprovalBinding){
 return{governancePlanId:binding.planId,desiredStateFingerprint:binding.desiredStateFingerprint}
}

export function assertGovernancePlanApprovalBinding(approved:Record<string,unknown>,current:GovernancePlanApprovalBinding){
 if(String(approved.governancePlanId??'')!==current.planId)throw new Error('Approved governance plan does not match the current plan.')
 if(String(approved.desiredStateFingerprint??'')!==current.desiredStateFingerprint)throw new Error('Governance approval was invalidated because desired state changed.')
}
