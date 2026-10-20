import { randomUUID, createHash } from 'node:crypto'
import type { LearningExperimentRunnerPorts, RunnerArmOutcome } from './learning-experiment-runner'

const digest=(value:string)=>`sha256:${createHash('sha256').update(value,'utf8').digest('hex')}`

/**
 * Deterministic $0 executor for synthetic assurance only.
 * It performs no network/provider/database writes and can never emit prospective evidence.
 */
export function createSyntheticLearningRunnerExecutor():LearningExperimentRunnerPorts['execute']{
  return async ({identity,input,executable,provenance})=>{
    if(provenance!=='synthetic') throw new Error('SYNTHETIC_EXECUTOR_PROSPECTIVE_DENIED')
    const bytes=JSON.stringify({
      caseKey:identity.caseKey,
      arm:identity.arm,
      inputHash:input.hash,
      executableHash:executable.hash,
      executionManifestHash:identity.executionManifestHash,
    })
    const output={ref:`synthetic:${identity.runId}:${identity.caseKey}:${identity.arm}`,hash:digest(bytes),bytes}
    const outcome:RunnerArmOutcome={
      identity,inputHash:input.hash,output,provenance:'synthetic',invocationId:randomUUID(),
      reservationId:null,settlementId:null,costEventId:null,costUsd:'0',tokens:0,latencyMs:0,
    }
    return outcome
  }
}
