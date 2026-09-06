import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906155200_harden_governance_risk_prediction_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'governance_risk_prediction_events_dataset_fk_idx',
  'governance_risk_prediction_events_prediction_fk_idx',
]

for (const index of required) {
  if (!sql.includes(index)) {
    throw new Error(`Missing required governance risk prediction FK index: ${index}`)
  }
}

if (!sql.includes('on governance.governance_risk_prediction_events (dataset_id)')) {
  throw new Error('Dataset FK index must lead with dataset_id')
}
if (!sql.includes('on governance.governance_risk_prediction_events (prediction_id)')) {
  throw new Error('Prediction FK index must lead with prediction_id')
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Risk prediction FK hardening must be additive and non-destructive')
}

console.log('Governance risk prediction FK index contract verified.')
