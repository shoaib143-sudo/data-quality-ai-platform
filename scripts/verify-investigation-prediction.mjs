import fs from 'node:fs'

const checks = [
  ['supabase/migrations/20260904224506_predictive_governance_business_impact.sql', [
    'governance.business_context_assets',
    'governance.dataset_business_context_links',
    'governance.governance_risk_predictions',
    "'DQ_SLA_BREACH_7D'",
    "'GOVERNANCE_RISK_30D'",
    'governance.refresh_business_context_from_governance',
    'governance.refresh_governance_risk_predictions',
    'governance.refresh_all_governance_risk_predictions',
    "e.source_id=d.id",
    "e.target_id=d.id",
    "'rules-v1'",
  ]],
  ['lib/governance/predictive-risk.ts', [
    'persistInvestigatorRiskAssessment',
    'refreshProjectPredictiveRisk',
    'refreshAllPredictiveRisk',
    "from('data_quality_investigations')",
    'enrichObservabilityIncidentWithLineageImpact',
    'correlateObservabilityIncidents',
    'INVESTIGATOR_PREDICTIVE_RISK_ASSESSMENT_PERSISTED',
  ]],
  ['lib/governance/predictive-risk-read.ts', [
    'listProjectPredictiveRisk',
    "schema('catalog').from('datasets')",
    "from('governance_risk_predictions')",
    "from('business_context_assets')",
    "from('observability_incident_correlations')",
  ]],
  ['app/api/governance/risk/route.ts', [
    "authorizeProject(user.id, projectId, 'observability.read')",
    "authorizeProject(user.id, projectId, 'agent.execute')",
    'refreshProjectPredictiveRisk',
    'listProjectPredictiveRisk',
  ]],
  ['app/api/agents/governance/run/route.ts', [
    "result.output.agent.key === 'investigator_agent'",
    'persistInvestigatorRiskAssessment',
  ]],
  ['app/api/agents/governance/handoff/route.ts', [
    "target.output.agent.key === 'investigator_agent'",
    'persistInvestigatorRiskAssessment',
    'predictive_investigation',
  ]],
  ['app/api/jobs/worker/route.ts', [
    'refreshAllPredictiveRisk',
    'predictiveRisk',
  ]],
]

const failures = []
for (const [path, tokens] of checks) {
  if (!fs.existsSync(path)) {
    failures.push(`${path}: missing file`)
    continue
  }
  const source = fs.readFileSync(path, 'utf8')
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${path}: missing ${token}`)
  }
}

const migration = fs.readFileSync('supabase/migrations/20260904224506_predictive_governance_business_impact.sql', 'utf8')
if (migration.includes('e.source_id=d.id::text') || migration.includes('e.target_id=d.id::text')) {
  failures.push('predictive risk migration regressed to uuid=text lineage comparison')
}
if (!migration.includes("not a learned black-box forecast")) {
  failures.push('predictive risk migration must disclose transparent rules-model semantics')
}

if (failures.length) {
  console.error('Investigation/prediction verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Investigation/prediction contracts verified.')
