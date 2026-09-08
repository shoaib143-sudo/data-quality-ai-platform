import fs from 'node:fs'

const contract = fs.readFileSync('lib/ai/evaluation-dataset.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-evaluation-dataset.ts', 'utf8')

const checks = [
  [contract.includes("datasetKind: 'verified_production_cases'"), 'dataset identifies verified production cases'],
  [contract.includes("sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING'"), 'dataset admits the canonical DQ learning source kind'],
  [contract.includes("decision_status !== 'VERIFIED'"), 'case decision must be verified'],
  [contract.includes("outcome_status !== 'VERIFIED'"), 'case outcome must be verified'],
  [contract.includes("learning.status !== 'VERIFIED'"), 'recommendation learning must be verified'],
  [contract.includes('learning.effective !== true'), 'recommendation learning must be effective'],
  [contract.includes("learning.outcome.status !== 'VERIFIED'"), 'remediation outcome must be verified'],
  [contract.includes('allChecksPassed(learning.outcome.checks)'), 'all deterministic verification checks must pass'],
  [contract.includes('hasSyntheticBootstrap'), 'synthetic bootstrap evidence is detected'],
  [contract.includes("key.toLowerCase() === 'synthetic_bootstrap'"), 'synthetic bootstrap flag is explicitly rejected'],
  [!contract.includes('recommendation: learningCase.recommendation'), 'AI recommendation prose is not projected as expected-answer truth'],
  [adapter.includes(".schema('agent')") && adapter.includes(".from('agent_learning_cases')"), 'adapter reads canonical agent learning cases'],
  [adapter.includes(".from('data_quality_recommendation_learning')"), 'adapter reads canonical DQ recommendation learning'],
  [adapter.includes(".from('data_quality_remediation_outcomes')"), 'adapter reads canonical remediation outcomes'],
  [adapter.includes(".eq('status', 'VERIFIED')"), 'adapter prefilters verified canonical evidence'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('ADR-006 verified evaluation dataset authority boundaries verified.')
