import fs from 'node:fs'

const model = fs.readFileSync('lib/data-quality/governed-dq-verification-timeline.ts', 'utf8')
const service = fs.readFileSync('lib/data-quality/governed-dq-verification-timeline-service.ts', 'utf8')
const route = fs.readFileSync('app/api/analytics/governed-dq-verification-timeline/route.ts', 'utf8')

const checks = [
  [model.includes("DQ_VERIFICATION_TIMELINE_VERSION = 'dq-verification-timeline-v1'"), 'versioned DQ verification timeline contract'],
  [model.includes("row.status === 'VERIFIED' && row.verifiedAt"), 'model admits VERIFIED evidence only'],
  [model.includes('verifiedAt <= cutoff && createdAt <= cutoff'), 'model blocks evidence beyond cutoff'],
  [model.includes("GOVERNANCE.DATA_QUALITY_REMEDIATION_OUTCOMES:${row.id}"), 'source-qualified lineage IDs'],
  [model.includes('productionMutationPerformed'), 'timeline preserves production mutation truth'],
  [model.includes('failedRuleDelta'), 'timeline exposes descriptive failed-rule movement'],
  [model.includes('severeFailureDelta'), 'timeline exposes descriptive severe-failure movement'],
  [model.includes("analysisType: 'DQ_VERIFICATION_EVIDENCE_TIMELINE'"), 'evidence envelope analysis type'],
  [model.includes('effectiveness_claimed: false'), 'effectiveness is not claimed'],
  [model.includes('predictive_probability_exposed: false'), 'predictive probability is disabled'],
  [model.includes('causal_effect_claimed: false'), 'causal effect is disabled'],
  [service.includes(".from('data_quality_remediation_outcomes')"), 'service reads canonical remediation outcome table'],
  [service.includes(".eq('status', 'VERIFIED')"), 'service prefilters VERIFIED rows'],
  [service.includes(".lte('verified_at', input.evidenceCutoffAt)"), 'service enforces verification cutoff'],
  [service.includes(".lte('created_at', input.evidenceCutoffAt)"), 'service enforces availability cutoff'],
  [route.includes('await requireUser()'), 'route requires current user'],
  [route.includes("authorizeProject(user.id, projectId, 'agent.view')"), 'route requires current project authorization'],
  [route.includes('persist: false'), 'read route cannot persist analysis state'],
  [route.includes('production_mutation_not_implied: true'), 'route does not imply production mutation'],
  [route.includes('effectiveness_claimed: false'), 'route does not claim effectiveness'],
  [route.includes('predictive_probability_exposed: false'), 'route exposes no predictive probability'],
  [route.includes('causal_effect_claimed: false'), 'route makes no causal claim'],
  [!route.includes('createAdminClient'), 'route does not bypass service/auth boundary'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('Governed DQ verification timeline authority, temporal, provenance, and no-causality contracts verified.')
