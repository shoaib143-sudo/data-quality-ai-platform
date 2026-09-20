import { evaluateIncidentSlaEscalations } from '@/lib/observability/incident-sla'
import { enqueueDueSchedules } from '@/lib/orchestration/schedules'
import { claimOutboxEvents, processOutboxEvents } from '@/lib/orchestration/outbox'
import { runOutboxLane, skippedOutboxLane, type OutboxLaneResult } from '@/lib/orchestration/outbox-lane'
import { runDurableQueueMaintenance, type DurableJob } from '@/lib/orchestration/queue'
import { processDurableJobs } from '@/lib/orchestration/worker'
import { dispatchAdaptiveRounds } from '@/lib/orchestration/adaptive-dispatch'
import { runProjectionWorker } from '@/lib/data-plane/run-projection-worker'
import { cleanupExpiredObjectArtifacts } from '@/lib/data-plane/object-lifecycle'
import { enqueueDailySemanticIndexJobs } from '@/lib/governance/semantic-jobs'
import { processSemanticIndexJobs } from '@/lib/governance/semantic-job-worker'
import { refreshAllPredictiveRisk } from '@/lib/governance/predictive-risk'
import { applyAllPredictiveRiskGovernedActions } from '@/lib/governance/governed-autonomy'
import { refreshAllAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { processGovernanceAgentJobs } from '@/lib/agents/governance-job-worker'
import { processApprovalNotificationOutbox } from '@/lib/governance/approval-notification-worker'
import { evaluateAgentApprovalSlaEscalations } from '@/lib/governance/approval-sla'
import { cleanupExpiredAgentEvidence } from '@/lib/agents/evidence-lifecycle'

function logOutboxLaneDegradation(workerId: string, lane: OutboxLaneResult) {
  if (!lane.degraded || lane.disposition === 'SKIPPED_AFTER_DEGRADATION') return
  const detail = lane.error ? `: ${lane.error}` : ''
  console.error('[worker-outbox]', `${workerId} ${lane.disposition}${detail}`.slice(0, 2000))
}

async function executeOutboxLane(workerId: string) {
  const lane = await runOutboxLane(workerId, 30, {
    claimEvents: claimOutboxEvents,
    processEvents: processOutboxEvents,
  })
  logOutboxLaneDegradation(workerId, lane)
  return lane
}

export async function runAdaptiveWorkerCycle(workerId: string) {
  const cycles: Array<Record<string, unknown>> = []
  const results: Array<Record<string, unknown>> = []
  const semanticResults: Array<Record<string, unknown>> = []
  const governanceAgentResults: Array<Record<string, unknown>> = []
  const eventResults: Array<Record<string, unknown>> = []
  const eventLaneDispositions: string[] = []
  let claimed = 0
  let eventsClaimed = 0
  let eventLaneBlocked = false
  let eventLaneDegraded = false

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const dispatch = await dispatchAdaptiveRounds(`${workerId}:jobs:${cycle}`, {
      maxRounds: 2,
      claimBatchSize: 8,
    })
    const eventWorkerId = `${workerId}:events:${cycle}`
    const eventLane = eventLaneBlocked ? skippedOutboxLane() : await executeOutboxLane(eventWorkerId)
    if (eventLane.degraded && eventLane.disposition !== 'SKIPPED_AFTER_DEGRADATION') {
      eventLaneBlocked = true
      eventLaneDegraded = true
    }

    claimed += dispatch.claimed
    eventsClaimed += eventLane.claimed
    results.push(...dispatch.results)
    semanticResults.push(...dispatch.semanticResults)
    governanceAgentResults.push(...dispatch.governanceAgentResults)
    eventResults.push(...eventLane.results)
    eventLaneDispositions.push(eventLane.disposition)
    cycles.push({
      cycle,
      jobsClaimed: dispatch.claimed,
      dispatchRounds: dispatch.rounds,
      eventsClaimed: eventLane.claimed,
      eventLaneDegraded: eventLane.degraded,
      eventLaneDisposition: eventLane.disposition,
    })

    if (dispatch.claimed === 0 && eventLane.claimed === 0) break
  }

  return {
    cycles,
    claimed,
    eventsClaimed,
    results,
    semanticResults,
    governanceAgentResults,
    eventResults,
    eventLaneDegraded,
    eventLaneDispositions,
  }
}

export async function runScheduledWorkerCycle(workerId: string) {
  const queueMaintenance = await runDurableQueueMaintenance()
  const scheduled = await enqueueDueSchedules(20)
  const dispatch = await dispatchAdaptiveRounds(workerId)
  const eventLane = await executeOutboxLane(workerId)
  const [incidentEscalations, projections, semanticIndexScheduling, objectRetention, agentEvidenceRetention] = await Promise.all([
    evaluateIncidentSlaEscalations(50),
    runProjectionWorker({ projectLimit: 10, batchSize: 200 }),
    enqueueDailySemanticIndexJobs(100),
    cleanupExpiredObjectArtifacts(25),
    cleanupExpiredAgentEvidence(50),
  ])
  const approvalSla = await evaluateAgentApprovalSlaEscalations(100)
  const approvalNotifications = await processApprovalNotificationOutbox(25)
  const predictiveRisk = await refreshAllPredictiveRisk()
  const aiGovernanceIntelligence = await refreshAllAIGovernanceIntelligence()
  const governedAutonomy = await applyAllPredictiveRiskGovernedActions()

  return {
    workerId,
    queueMaintenance,
    scheduled,
    adaptiveDispatch: true,
    dispatchRounds: dispatch.rounds,
    claimed: dispatch.claimed,
    results: dispatch.results,
    semanticResults: dispatch.semanticResults,
    governanceAgentResults: dispatch.governanceAgentResults,
    semanticIndexScheduling,
    objectRetention,
    agentEvidenceRetention,
    approvalSla,
    approvalNotifications,
    predictiveRisk,
    aiGovernanceIntelligence,
    governedAutonomy,
    eventsClaimed: eventLane.claimed,
    eventResults: eventLane.results,
    eventLaneDegraded: eventLane.degraded,
    eventLaneDisposition: eventLane.disposition,
    incidentEscalations,
    projections,
  }
}

export async function processClaimedDurableJob(job: DurableJob) {
  if (job.job_type === 'SEMANTIC_INDEX') {
    return { semanticResults: await processSemanticIndexJobs([job]) }
  }
  if (job.job_type === 'GOVERNANCE_AGENT') {
    return { governanceAgentResults: await processGovernanceAgentJobs([job]) }
  }
  return { results: await processDurableJobs([job]) }
}
