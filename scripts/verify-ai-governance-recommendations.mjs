import fs from 'node:fs'

const baseMigration = fs.readFileSync('supabase/migrations/20260907051000_evidence_backed_governance_recommendations.sql', 'utf8')
const stabilityMigration = fs.readFileSync('supabase/migrations/20260907053500_stabilize_ai_governance_recommendation_identity.sql', 'utf8')
const capabilityCountMigration = fs.readFileSync('supabase/migrations/20260907055500_current_ai_capability_recommendation_count.sql', 'utf8')
const migration = `${baseMigration}\n${stabilityMigration}\n${capabilityCountMigration}`

function requireText(needle, label) {
  if (!migration.includes(needle)) throw new Error(`AI governance recommendation contract missing: ${label}`)
}

requireText('governance.refresh_ai_governance_recommendations', 'recommendation refresh RPC')
requireText("'POLICY_CONTROL'", 'governance suggestion type')
requireText("'authority_boundary','ADVISORY_ONLY'", 'advisory-only authority boundary')
requireText("'policy_grounded',false", 'no false policy grounding')
requireText('APPROVED_ENTERPRISE_GOVERNANCE_CORPUS_REQUIRED', 'knowledge readiness blocker')
requireText("source_kind<>'SYNTHETIC'", 'non-synthetic policy authority requirement')
requireText("review_status='APPROVED'", 'approved governance corpus requirement')
requireText("(59,'AI generated governance recommendations','governance_recommendations')", 'capability 59 evidence domain')
requireText("when 'governance_recommendations' then e.governance_recommendations", 'capability 59 live evidence count')
requireText("when 'governance_recommendations' then 'governance.ai_governance_suggestions'", 'capability 59 evidence source')
requireText('v_suggestion_result:=governance.refresh_ai_governance_recommendations(p.id)', 'normal intelligence refresh integration')
requireText('requires_human_approval', 'human governance boundary')
requireText('governance.current_ai_governance_recommendation_count', 'current recommendation count contract')
requireText("'recommendation-identity-v2'", 'stable recommendation identity version')
requireText("case when coalesce(e.governance_risk_probability,0)>=0.4 then 'RISK_REVIEW' else 'NO_RISK_REVIEW' end", 'risk threshold state identity')
requireText("case when coalesce(e.overall_score,1)<0.80 then 'QUALITY_REVIEW' else 'QUALITY_OK' end", 'quality threshold state identity')
requireText("(select governance.current_ai_governance_recommendation_count(p_project_id)) as governance_recommendations", 'capability 59 current-state evidence count')
requireText('count distinct current non-expired AI governance recommendation contexts', 'capability 59 matrix semantics comment')
if (stabilityMigration.includes("coalesce(e.governance_risk_probability::text,''),")) {
  throw new Error('Stable recommendation identity must not hash the continuously refreshed exact risk probability.')
}
if (capabilityCountMigration.includes('(select count(*) from governance.ai_governance_suggestions where project_id=p_project_id) as governance_recommendations') && !capabilityCountMigration.includes('v_old')) {
  throw new Error('Capability 59 must not count raw historical suggestion rows as current evidence.')
}

console.log('Evidence-backed AI governance recommendation stability contract verified.')
