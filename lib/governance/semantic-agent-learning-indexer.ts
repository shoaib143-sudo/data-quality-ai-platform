import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSemanticObject, indexSemanticObject } from '@/lib/governance/semantic-search'

type LearningCaseRow = {
  id: string
  case_key: string
  source_kind: string
  problem_type: string
  context: Record<string, unknown>
  recommendation: Record<string, unknown>
  decision_status: string | null
  outcome_status: string | null
  effectiveness: number | string | null
  confidence: number | string | null
  evidence: Record<string, unknown>
  occurred_at: string | null
  updated_at: string
}

function content(row: LearningCaseRow) {
  return [
    row.problem_type,
    `Source: ${row.source_kind}`,
    row.outcome_status ? `Outcome: ${row.outcome_status}` : null,
    row.effectiveness === null ? null : `Effectiveness: ${row.effectiveness}`,
    row.confidence === null ? null : `Confidence: ${row.confidence}`,
    `Context: ${JSON.stringify(row.context)}`,
    `Recommendation: ${JSON.stringify(row.recommendation)}`,
    `Evidence: ${JSON.stringify(row.evidence)}`,
  ].filter(Boolean).join('\n')
}

export async function reindexProjectAgentLearningCases(projectId: string, options: { concurrency?: number } = {}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_learning_cases')
    .select('id,case_key,source_kind,problem_type,context,recommendation,decision_status,outcome_status,effectiveness,confidence,evidence,occurred_at,updated_at')
    .eq('project_id', projectId)
    .eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(`Unable to collect agent learning cases: ${error.message}`)

  const rows = (data ?? []) as LearningCaseRow[]
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3))
  let cursor = 0
  let indexed = 0
  let failed = 0
  const errors: string[] = []

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      try {
        await indexSemanticObject({
          projectId,
          objectType: 'AGENT_LEARNING_CASE',
          objectKey: row.case_key,
          objectId: row.id,
          content: content(row),
          metadata: {
            case_key: row.case_key,
            source_kind: row.source_kind,
            problem_type: row.problem_type,
            decision_status: row.decision_status,
            outcome_status: row.outcome_status,
            effectiveness: row.effectiveness,
            confidence: row.confidence,
            occurred_at: row.occurred_at,
          },
        })
        indexed += 1
      } catch (error) {
        failed += 1
        errors.push(error instanceof Error ? error.message : 'Agent learning semantic indexing failed.')
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, () => worker()))

  const activeKeys = new Set(rows.map((row) => row.case_key))
  const { data: existing, error: existingError } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('object_key')
    .eq('project_id', projectId)
    .eq('object_type', 'AGENT_LEARNING_CASE')
  if (existingError) throw new Error(`Unable to inspect indexed agent learning cases: ${existingError.message}`)

  let pruned = 0
  for (const row of existing ?? []) {
    const key = String(row.object_key)
    if (activeKeys.has(key)) continue
    await deleteSemanticObject({ projectId, objectType: 'AGENT_LEARNING_CASE', objectKey: key })
    pruned += 1
  }

  return { indexed, failed, pruned, errors: errors.slice(0, 20) }
}
