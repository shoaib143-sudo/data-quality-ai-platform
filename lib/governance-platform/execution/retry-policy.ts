import { GovernanceProviderError } from '../providers/sdk/errors'

export type GovernanceRetryDecision={retry:boolean;reason:string}
export type GovernanceRetryRuntime={
 maxAttempts?:number
 baseDelayMs?:number
 maxDelayMs?:number
 sleep?:(delayMs:number)=>Promise<void>
 random?:()=>number
}

export function governanceRetryDecision(error:unknown,attempt:number,maxAttempts:number):GovernanceRetryDecision{
 if(attempt>=maxAttempts)return{retry:false,reason:'MAX_ATTEMPTS_REACHED'}
 if(!(error instanceof GovernanceProviderError))return{retry:false,reason:'UNCLASSIFIED_FAILURE'}
 if(!error.retryable)return{retry:false,reason:error.code}
 return{retry:true,reason:error.code}
}

export function governanceRetryDelayMs(attempt:number,baseMs=250,maxMs=10_000,jitter=0){
 const exponential=Math.min(maxMs,baseMs*Math.pow(2,Math.max(0,attempt-1)))
 const boundedJitter=Math.max(0,Math.min(1,jitter))
 return Math.min(maxMs,Math.round(exponential*(1+boundedJitter)))
}

export async function executeWithGovernanceRetry<T>(
 operation:(attempt:number)=>Promise<T>,
 runtime:GovernanceRetryRuntime={},
):Promise<{value:T;attempts:number}>{
 const maxAttempts=Math.max(1,Math.floor(runtime.maxAttempts??3))
 const sleep=runtime.sleep??(delayMs=>new Promise(resolve=>setTimeout(resolve,delayMs)))
 const random=runtime.random??Math.random
 for(let attempt=1;attempt<=maxAttempts;attempt+=1){
  try{return{value:await operation(attempt),attempts:attempt}}
  catch(error){
   const decision=governanceRetryDecision(error,attempt,maxAttempts)
   if(!decision.retry)throw error
   await sleep(governanceRetryDelayMs(attempt,runtime.baseDelayMs,runtime.maxDelayMs,random()))
  }
 }
 throw new Error('Governance retry runtime exhausted unexpectedly.')
}
