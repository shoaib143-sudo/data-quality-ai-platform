export type GovernanceCheckpointStatus='PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'|'VERIFIED'
export type GovernanceCheckpoint={
 planId:string
 operationId:string
 idempotencyKey:string
 status:GovernanceCheckpointStatus
 attempts:number
 providerObjectId:string|null
 providerJobId:string|null
 executionEvidence:Record<string,unknown>
 verificationStatus:string|null
 updatedAt:string
}

export interface GovernanceCheckpointStore{get(idempotencyKey:string):Promise<GovernanceCheckpoint|null>;put(checkpoint:GovernanceCheckpoint):Promise<void>}

export type GovernanceResumeAction='EXECUTE'|'POLL'|'VERIFY'|'COMPLETE'

export function governanceResumeAction(checkpoint:GovernanceCheckpoint|null):GovernanceResumeAction{
 if(!checkpoint)return'EXECUTE'
 if(checkpoint.status==='VERIFIED')return'COMPLETE'
 if(checkpoint.status==='SUCCEEDED')return'VERIFY'
 if(checkpoint.status==='PENDING'||checkpoint.status==='RUNNING')return checkpoint.providerJobId?'POLL':'EXECUTE'
 return'EXECUTE'
}

export async function claimGovernanceOperation(store:GovernanceCheckpointStore,input:Pick<GovernanceCheckpoint,'planId'|'operationId'|'idempotencyKey'>){
 const existing=await store.get(input.idempotencyKey)
 const resumeAction=governanceResumeAction(existing)
 if(resumeAction==='COMPLETE'||resumeAction==='VERIFY'||resumeAction==='POLL')return{claimed:false as const,resumeAction,checkpoint:existing!}
 const checkpoint:GovernanceCheckpoint={
  ...input,status:'RUNNING',attempts:(existing?.attempts??0)+1,
  providerObjectId:existing?.providerObjectId??null,providerJobId:existing?.providerJobId??null,
  executionEvidence:existing?.executionEvidence??{},verificationStatus:existing?.verificationStatus??null,
  updatedAt:new Date().toISOString(),
 }
 await store.put(checkpoint);return{claimed:true as const,resumeAction,checkpoint}
}
