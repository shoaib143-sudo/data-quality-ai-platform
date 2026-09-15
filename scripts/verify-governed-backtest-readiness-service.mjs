import fs from 'node:fs'

const adapter = fs.readFileSync('lib/ai/governance-evaluation-dataset.ts', 'utf8')
const service = fs.readFileSync('lib/ai/governed-backtesting-service.ts', 'utf8')
const route = fs.readFileSync('app/api/analytics/governed-backtest-readiness/route.ts', 'utf8')
const engine = fs.readFileSync('lib/ai/governed-backtesting.ts', 'utf8')

const checks = [
  [adapter.includes(".from('data_quality_recommendation_learning')"), 'adapter uses canonical recommendation learning table'],
  [adapter.includes(".eq('status', 'VERIFIED')"), 'adapter requires verified recommendation learning'],
  [!adapter.includes(".eq('effective', true)"), 'adapter must preserve verified negative outcomes'],
  [adapter.includes(".from('data_quality_remediation_outcomes')"), 'adapter uses canonical remediation outcomes'],
  [service.includes('createGovernanceEvaluationDatasetBuilder'), 'service uses canonical evaluation dataset builder'],
  [service.includes('buildGovernedBacktestReadiness'), 'service reuses governed backtest engine'],
  [service.includes('datasetLimit') && service.includes('500'), 'service bounds dataset reads'],
  [route.includes('requireUser()'), 'route requires authenticated user'],
  [route.includes("authorizeProject(user.id, projectId, 'agent.view')"), 'route requires current project authorization'],
  [route.includes('verified_negative_outcomes_preserved: true'), 'route declares negative outcome preservation'],
  [route.includes('predictive_probability_exposed: false'), 'route exposes no predictive probability'],
  [route.includes('shadow_decision_authority: false'), 'route grants no shadow decision authority'],
  [route.includes('read_only: true'), 'route is explicitly read only'],
  [!service.includes('.insert(') && !service.includes('.update(') && !service.includes('.delete(') && !service.includes('.upsert('), 'service performs no writes'],
  [engine.includes("status: 'READY' | 'NOT_READY'"), 'engine preserves readiness gate'],
  [engine.includes("'TRAINING_CLASS_COLLAPSE'") && engine.includes("'EVALUATION_CLASS_COLLAPSE'"), 'engine fails closed on class collapse'],
  [engine.includes('predictiveProbabilityExposed: false'), 'engine keeps prediction disabled'],
  [engine.includes('shadowDecisionAuthority: false'), 'engine keeps shadow authority disabled'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('Governed backtest readiness service, negative-outcome preservation, temporal readiness, authorization, and no-authority boundaries verified.')
