import type { ProviderPlannedOperation } from '../planning/provider-plan.ts'

export function planGovernanceBatches(operations:ProviderPlannedOperation[],maxBatchSize:number){
 if(!Number.isInteger(maxBatchSize)||maxBatchSize<1)throw new Error('maxBatchSize must be a positive integer.')
 const batches:ProviderPlannedOperation[][]=[]
 for(let index=0;index<operations.length;index+=maxBatchSize)batches.push(operations.slice(index,index+maxBatchSize))
 return batches
}

export function assertSingleProviderBatch(batch:ProviderPlannedOperation[]){
 const keys=new Set(batch.map(operation=>`${operation.provider}:${operation.connectionId}`))
 if(keys.size>1)throw new Error('Governance execution batch cannot span provider connections.')
}
