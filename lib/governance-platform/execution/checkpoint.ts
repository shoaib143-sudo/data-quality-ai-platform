export type GovernanceCheckpointStatus='PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'|'VERIFIED'
export type GovernanceCheckpoint={
 planId:string
 operationId:string
 idempotencyKey:string
 status:GovernanceCheckpointStatus
 attempts:number
 claimGeneration?:number
 providerObjectId:string|null
 providerJobId:string|null
 executionEvidence:Record<string,unknown>
 verificationStatus:string|null
 updatedAt:string
}

export type GovernanceResumeAction='EXECUTE'|'POLL'|'VERIFY'|'RECOVER'|'WAIT'|'FAILED'|'COMPLETE'
export type GovernanceClaimResult={claimed:boolean;resumeAction:GovernanceResumeAction;checkpoint:GovernanceCheckpoint}
export interface GovernanceCheckpointStore{
 get(idempotencyKey:string):Promise<GovernanceCheckpoint|null>
 put(checkpoint:GovernanceCheckpoint):Promise<void>
 claim?(input:Pick<GovernanceCheckpoint,'planId'|'operationId'|'idempotencyKey'>):Promise<GovernanceClaimResult>
}

export function governanceResumeAction(checkpoint:GovernanceCheckpoint|null):GovernanceResumeAction{
 if(!checkpoint)return'EXECUTE'
 if(checkpoint.status==='VERIFIED')return'COMPLETE'
 if(checkpoint.status==='SUCCEEDED')return'VERIFY'
 if(checkpoint.status==='FAILED')return'FAILED'
 if(checkpoint.status==='PENDING'||checkpoint.status==='RUNNING')return checkpoint.providerJobId?'POLL':'WAIT'
 return'WAIT'
}

export async function claimGovernanceOperation(store:GovernanceCheckpointStore,input:Pick<GovernanceCheckpoint,'planId'|'operationId'|'idempotencyKey'>){
 if(store.claim)return store.claim(input)
 const existing=await store.get(input.idempotencyKey)
 const resumeAction=governanceResumeAction(existing)
 if(existing&&resumeAction!=='EXECUTE')return{claimed:false as const,resumeAction,checkpoint:existing}
 const checkpoint:GovernanceCheckpoint={
  ...input,status:'RUNNING',attempts:1,
  providerObjectId:null,providerJobId:null,
  executionEvidence:{},verificationStatus:null,
  updatedAt:new Date().toISOString(),
 }
 await store.put(checkpoint);return{claimed:true as const,resumeAction:'EXECUTE' as const,checkpoint}
}
