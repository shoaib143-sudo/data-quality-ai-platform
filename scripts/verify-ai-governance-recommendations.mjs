import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260907051000_evidence_backed_governance_recommendations.sql', 'utf8')

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

console.log('Evidence-backed AI governance recommendation contract verified.')
