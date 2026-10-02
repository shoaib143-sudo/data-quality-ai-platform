import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LearningExperimentRunnerStore, RunnerArmOutcome, RunnerAttemptClaim } from './learning-experiment-runner'

/** Live-only persistence. Synthetic preparation must use an isolated store.
 * The cancellation reader must resolve server-owned, project-scoped job truth.
 * No constructor option defaults cancellation or evidence verification to success.
 */
export function createLearningExperimentRunnerStore(input: {
  isCancelled: (runId: string) => Promise<boolean>
}): LearningExperimentRunnerStore {
  const admin = createAdminClient()
  return {
    isCancelled: input.isCancelled,
    async claimDispatch(identity, inputHash): Promise<RunnerAttemptClaim> {
      const { data, error } = await admin.schema('agent').rpc('claim_learning_experiment_dispatch', {
        p_identity: identity, p_input_hash: inputHash,
      })
      if (error) throw new Error(`Learning dispatch claim failed: ${error.message}`)
      if (data?.status === 'acquired' && typeof data.claimId === 'string') return { status: 'acquired', claimId: data.claimId }
      if (data?.status === 'completed' && data.outcome && typeof data.outcome === 'object') return { status: 'completed', outcome: data.outcome as RunnerArmOutcome }
      if (['ambiguous', 'cancelled', 'failed'].includes(data?.status)) return { status: data.status as 'ambiguous' | 'cancelled' | 'failed' }
      throw new Error('Invalid durable learning dispatch claim')
    },
    async completeDispatch(claimId, outcome) {
      if (outcome.provenance !== 'prospective' || !outcome.reservationId || !outcome.settlementId || !outcome.costEventId) throw new Error('Synthetic or unaccounted output cannot enter live learning persistence')
      const { data, error } = await admin.schema('agent').rpc('complete_learning_experiment_dispatch', {
        p_claim_id: claimId, p_outcome: outcome,
        p_reservation_id: outcome.reservationId, p_cost_event_id: outcome.costEventId,
      })
      if (error) throw new Error(`Learning dispatch outcome failed: ${error.message}`)
      if (data !== true) throw new Error('Invalid durable learning dispatch completion')
    },
  }
}
