export type GovernanceCheckpointStatus='PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED'|'VERIFIED'
export type GovernanceCheckpoint={planId:string;operationId:string;idempotencyKey:string;status:GovernanceCheckpointStatus;attempts:number;providerJobId:string|null;updatedAt:string}

export interface GovernanceCheckpointStore{get(idempotencyKey:string):Promise<GovernanceCheckpoint|null>;put(checkpoint:GovernanceCheckpoint):Promise<void>}

export async function claimGovernanceOperation(store:GovernanceCheckpointStore,input:Omit<GovernanceCheckpoint,'status'|'attempts'|'providerJobId'|'updatedAt'>){
 const existing=await store.get(input.idempotencyKey)
 if(existing?.status==='SUCCEEDED'||existing?.status==='VERIFIED')return{claimed:false as const,checkpoint:existing}
 const checkpoint:GovernanceCheckpoint={...input,status:'RUNNING',attempts:(existing?.attempts??0)+1,providerJobId:existing?.providerJobId??null,updatedAt:new Date().toISOString()}
 await store.put(checkpoint);return{claimed:true as const,checkpoint}
}
