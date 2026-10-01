import { GovernanceProviderError } from '../providers/sdk/errors'

export type GovernanceRetryDecision={retry:boolean;reason:string}

export function governanceRetryDecision(error:unknown,attempt:number,maxAttempts:number):GovernanceRetryDecision{
 if(attempt>=maxAttempts)return{retry:false,reason:'MAX_ATTEMPTS_REACHED'}
 if(!(error instanceof GovernanceProviderError))return{retry:false,reason:'UNCLASSIFIED_FAILURE'}
 if(!error.retryable)return{retry:false,reason:error.code}
 return{retry:true,reason:error.code}
}

export function governanceRetryDelayMs(attempt:number,baseMs=250,maxMs=10_000,jitter=0){
 const exponential=Math.min(maxMs,baseMs*Math.pow(2,Math.max(0,attempt-1)))
 const boundedJitter=Math.max(0,Math.min(1,jitter))
 return Math.round(exponential*(1+boundedJitter))
}
