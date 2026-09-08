import fs from 'node:fs'

const engine = fs.readFileSync('lib/ai/learning-engine.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-learning-engine.ts', 'utf8')

const checks = [
  [engine.includes('export interface LearningEngine'), 'stable LearningEngine interface'],
  [engine.includes("'VERIFIED_OUTCOME_CANDIDATE'"), 'verified outcome candidate state'],
  [engine.includes("'DURABLE_UNVALIDATED_SEMANTIC'"), 'durable unvalidated semantic state'],
  [engine.includes("'HUMAN_VALIDATED_SEMANTIC_CANDIDATE'"), 'human validation does not imply authority'],
  [engine.includes("'AUTHORITY_PROOF_NOT_RECORDED'"), 'explicit missing authority proof blocker'],
  [engine.includes('hasSyntheticBootstrap(row.evidence)'), 'synthetic bootstrap exclusion'],
  [engine.includes("row.decision_status !== 'VERIFIED' || row.outcome_status !== 'VERIFIED'"), 'verified outcome requirement'],
  [engine.includes('if (!row.source_agent_run_id)'), 'source agent run requirement'],
  [engine.includes('authoritative: false'), 'learning candidates fail closed on authority'],
  [engine.includes('authoritativeSemanticCount: 0'), 'no semantic authority inferred from promoted_at'],
  [engine.includes('semanticPromotionEnabled: false'), 'semantic promotion disabled'],
  [engine.includes('proceduralPromotionEnabled: false'), 'procedural promotion disabled'],
  [engine.includes('offlineAdaptationEnabled: false'), 'offline adaptation disabled'],
  [!engine.includes('recommendation:'), 'recommendation prose excluded from assessment contract'],
  [adapter.includes(".from('agent_learning_cases')"), 'canonical learning case store'],
  [adapter.includes(".from('agent_memories')"), 'canonical durable memory store'],
  [adapter.includes(".eq('memory_type', 'SEMANTIC')"), 'semantic memory assessment scope'],
  [adapter.includes(".eq('status', 'ACTIVE')"), 'active record scope'],
]

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`LearningEngine contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('ADR-006 LearningEngine verification completed.')
