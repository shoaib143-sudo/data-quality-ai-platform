import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

const [knowledgeMigration, dqMigration, rulesRoute, ruleReviewRoute, knowledgeReviewRoute] = await Promise.all([
  source('supabase/migrations/20260905010733_enforce_governance_human_review_boundary.sql'),
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

requireMatch(dqMigration, /approval_status text not null default 'NOT_REQUIRED'/, 'DQ rules must persist an explicit approval status.')
requireMatch(dqMigration, /where origin='SUGGESTED'[\s\S]*enabled=false/, 'Existing suggested DQ rules must be moved to a non-executing approval state.')
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
requireMatch(knowledgeReviewRoute, /audit_atomic !== true/, 'Knowledge review API must require atomic audit confirmation.')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    classificationHumanReview: true,
    cdeHumanReview: true,
    dqSuggestedRuleApproval: true,
    dqMaterialChangeReapproval: true,
    projectScopedRuleReads: true,
    atomicReviewAudit: true,
    databaseCapabilityVerification: true,
  },
}, null, 2))
