import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/memory-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-memory-provider.ts', 'utf8')

const checks = [
  [provider.includes('export interface MemoryProvider'), 'stable MemoryProvider interface'],
  [provider.includes("| 'working'"), 'working memory class'],
  [provider.includes("| 'episodic'"), 'episodic memory class'],
  [provider.includes("| 'semantic'"), 'semantic target memory class'],
  [provider.includes("| 'procedural'"), 'procedural target memory class'],
  [provider.includes("| 'performance'"), 'performance target memory class'],
  [provider.includes("| 'forbidden'"), 'forbidden memory class'],
  [provider.includes('working: true') && provider.includes('episodic: true'), 'truthful supported memory capabilities'],
  [provider.includes('semantic: false') && provider.includes('procedural: false') && provider.includes('performance: false') && provider.includes('forbidden: false'), 'unsupported memory classes fail closed'],
  [provider.includes("source: 'agent.agent_working_memory'"), 'working memory provenance'],
  [provider.includes("source: 'agent.agent_learning_cases'"), 'episodic memory provenance'],
  [provider.includes("row.decision_status !== 'VERIFIED' || row.outcome_status !== 'VERIFIED'"), 'verified episodic outcome boundary'],
  [provider.includes('hasSyntheticBootstrap(row.evidence)'), 'synthetic bootstrap exclusion'],
  [provider.includes('if (!row.source_agent_run_id) continue'), 'episodic source-run evidence requirement'],
  [!provider.includes('recommendation: row.recommendation'), 'AI recommendation prose not promoted as memory truth'],
  [adapter.includes(".from('agent_working_memory')"), 'canonical working-memory store'],
  [adapter.includes(".from('agent_learning_cases')"), 'canonical episodic-memory store'],
  [adapter.includes(".gt('expires_at', now)"), 'expired working memory excluded at source'],
  [adapter.includes(".not('source_agent_run_id', 'is', null)"), 'episodic adapter requires observed source run'],
]

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`MemoryProvider contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('ADR-006 MemoryProvider verification completed.')
