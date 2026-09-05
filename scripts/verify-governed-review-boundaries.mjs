import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

const [
  knowledgeMigration,
  enterpriseKnowledgeMigration,
  formalHumanReviewGate,
  dqMigration,
  rulesRoute,
  ruleReviewRoute,
  knowledgeReviewRoute,
] = await Promise.all([
  source('supabase/migrations/20260905010733_enforce_governance_human_review_boundary.sql'),
  source('supabase/migrations/20260905030354_governed_enterprise_knowledge_document_approval.sql'),
  source('supabase/migrations/20260905042058_strengthen_formal_human_review_boundary_gate.sql'),
  source('supabase/migrations/20260905011025_governed_data_quality_rule_approval.sql'),
  source('app/api/data-quality/rules/route.ts'),
  source('app/api/data-quality/rules/review/route.ts'),
  source('app/api/governance/knowledge/review/route.ts'),
])

requireMatch(knowledgeMigration, /has_project_capability\(p_project_id,p_reviewer,'classification\.review'\)/, 'Classification review RPC must verify classification.review inside PostgreSQL.')
requireMatch(knowledgeMigration, /has_project_capability\(p_project_id,p_reviewer,'stewardship\.manage'\)/, 'CDE review RPC must verify stewardship.manage inside PostgreSQL.')
requireMatch(knowledgeMigration, /knowledge_review_context/, 'Governance knowledge decisions must use an internal audited review context.')
requireMatch(knowledgeMigration, /must be written through the governed review workflow/, 'Direct governance knowledge final-state writes must be blocked.')
requireMatch(knowledgeMigration, /revoke all on function governance\.review_dataset_classification[\s\S]*public, anon, authenticated/, 'Classification review RPC must not be directly executable by public/anon/authenticated.')
requireMatch(knowledgeMigration, /revoke all on function governance\.review_cde_mapping[\s\S]*public, anon, authenticated/, 'CDE review RPC must not be directly executable by public/anon/authenticated.')

requireMatch(enterpriseKnowledgeMigration, /trg_protect_knowledge_document_review/, 'Enterprise knowledge documents must have a direct-review protection trigger.')
requireMatch(enterpriseKnowledgeMigration, /review_governance_knowledge_document/, 'Enterprise knowledge documents must use a governed review RPC.')
requireMatch(enterpriseKnowledgeMigration, /has_project_capability\(p_project_id,p_reviewer,'policy\.approve'\)/, 'Enterprise knowledge review RPC must verify policy.approve inside PostgreSQL.')
requireMatch(enterpriseKnowledgeMigration, /revoke execute on function governance\.review_governance_knowledge_document[\s\S]*public, anon, authenticated/, 'Enterprise knowledge review RPC must not be directly executable by public/anon/authenticated.')

requireMatch(formalHumanReviewGate, /knowledge_document_review_rpc/, 'Formal AI governance gate must expose enterprise knowledge review RPC evidence.')
requireMatch(formalHumanReviewGate, /knowledge_document_protection_trigger/, 'Formal AI governance gate must expose enterprise knowledge protection-trigger evidence.')
requireMatch(formalHumanReviewGate, /classification_protection_trigger/, 'Formal AI governance gate must expose classification protection-trigger evidence.')
requireMatch(formalHumanReviewGate, /cde_protection_trigger/, 'Formal AI governance gate must expose CDE protection-trigger evidence.')
requireMatch(formalHumanReviewGate, /v_any_review_failure :=[\s\S]*not v_knowledge_rpc[\s\S]*not v_knowledge_trigger/, 'Formal AI governance gate must treat any missing human-review RPC or trigger as a review-boundary failure.')
requireMatch(formalHumanReviewGate, /if v_any_review_failure and not v_existing_review_rpc_failure then[\s\S]*v_failure_count := v_failure_count \+ 1/, 'Formal AI governance gate must count trigger-only or enterprise-review failures in failure_count.')
requireMatch(formalHumanReviewGate, /HUMAN_REVIEW_RPC_AND_PROTECTION_TRIGGER_REQUIRED/, 'Formal AI governance gate must publish the complete human-review policy.')

requireMatch(dqMigration, /approval_status text not null default 'NOT_REQUIRED'/, 'DQ rules must persist an explicit approval status.')
requireMatch(dqMigration, /set approval_status='PENDING',[\s\S]*enabled=false[\s\S]*where origin='SUGGESTED'/i, 'Existing suggested DQ rules must be moved to a non-executing approval state.')
requireMatch(dqMigration, /new\.approval_status := 'PENDING'[\s\S]*new\.enabled := false/, 'New suggested DQ rules must default to PENDING and disabled.')
requireMatch(dqMigration, /approval_reset_reason','MATERIAL_RULE_CHANGE'/, 'Material changes to approved suggested DQ rules must reset approval.')
requireMatch(dqMigration, /has_project_capability\(p_project_id,p_reviewer,'quality\.manage'\)/, 'DQ rule review RPC must verify quality.manage inside PostgreSQL.')
requireMatch(dqMigration, /QUALITY_RULE_REVIEW_DECIDED/, 'DQ rule review decisions must be audit events.')
requireMatch(dqMigration, /revoke all on function profiling\.review_quality_rule[\s\S]*public, anon, authenticated/, 'DQ rule review RPC must not be directly executable by public/anon/authenticated.')

requireMatch(rulesRoute, /authorizeProject\(user\.id, projectId, 'quality\.read'\)/, 'Quality-rule reads must require quality.read.')
requireMatch(rulesRoute, /\.eq\('project_id', projectId\)/, 'Quality-rule reads must be project scoped before using the admin client.')
requireMatch(rulesRoute, /authorizeProject\(user\.id, projectId, 'quality\.manage'\)/, 'Quality-rule creation must require quality.manage.')
requireMatch(rulesRoute, /origin: 'USER'/, 'User-created rules must remain distinguishable from AI/system suggestions.')
requireMatch(ruleReviewRoute, /authorizeProject\(user\.id, projectId, 'quality\.manage'\)/, 'Quality-rule review API must require quality.manage.')
requireMatch(ruleReviewRoute, /rpc\('review_quality_rule'/, 'Quality-rule review API must use the governed database review RPC.')
requireMatch(ruleReviewRoute, /audit_atomic !== true[\s\S]*database_capability_verified !== true/, 'Quality-rule review API must require atomic audit and DB capability confirmation.')
requireMatch(knowledgeReviewRoute, /classification\.review[\s\S]*stewardship\.manage/, 'Knowledge review API must preserve role-specific review capabilities.')
requireMatch(knowledgeReviewRoute, /KNOWLEDGE_DOCUMENT/, 'Knowledge review API must support enterprise knowledge document review.')
requireMatch(knowledgeReviewRoute, /policy\.approve/, 'Knowledge document review API must require policy.approve.')
requireMatch(knowledgeReviewRoute, /review_governance_knowledge_document/, 'Knowledge document review API must use the governed enterprise review RPC.')
requireMatch(knowledgeReviewRoute, /audit_atomic !== true/, 'Knowledge review API must require atomic audit confirmation.')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    classificationHumanReview: true,
    cdeHumanReview: true,
    enterpriseKnowledgeDocumentHumanReview: true,
    formalGateCountsMissingReviewControls: true,
    dqSuggestedRuleApproval: true,
    dqMaterialChangeReapproval: true,
    projectScopedRuleReads: true,
    atomicReviewAudit: true,
    databaseCapabilityVerification: true,
  },
}, null, 2))
