import assert from 'node:assert/strict'
import fs from 'node:fs'

const stewardship = fs.readFileSync('supabase/migrations/20260906110000_governed_ownership_stewardship.sql', 'utf8')
const glossary = fs.readFileSync('supabase/migrations/20260906093000_governed_business_glossary_semantics.sql', 'utf8')
const classification = fs.readFileSync('supabase/migrations/20260906031000_governed_classification_privacy.sql', 'utf8')
const quality = fs.readFileSync('supabase/migrations/20260906033000_harden_quality_and_policy_controls.sql', 'utf8')
const issues = fs.readFileSync('app/api/issues/route.ts', 'utf8')
const issueMutation = fs.readFileSync('app/api/issues/[issueId]/route.ts', 'utf8')

for (const token of [
  'governance.stewardship_assignment_events',
  'stewardship_assignment_events_append_only',
  'stewardship_assignment_evidence_capture',
  'governance.audit_events',
]) assert.ok(stewardship.includes(token), `Stewardship evidence contract missing ${token}`)

for (const token of [
  'governance.glossary_term_versions',
  'glossary_term_version_capture',
  'capture_glossary_term_version',
]) assert.ok(glossary.includes(token), `Glossary evidence contract missing ${token}`)

for (const token of [
  'governance.classification_events',
  'classification_events_append_only',
  'capture_classification_event',
  'governance.audit_events',
]) assert.ok(classification.includes(token), `Classification evidence contract missing ${token}`)

for (const token of [
  'profiling.quality_rule_versions',
  'quality_rule_semantic_version',
  'profiling.quality_rule_run_events',
  'quality_rule_run_events_immutable',
  'capture_quality_rule_run_event',
]) assert.ok(quality.includes(token), `Quality evidence contract missing ${token}`)

assert.match(issues, /writeGovernanceAudit/)
assert.match(issues, /ISSUE_CREATED/)
assert.match(issues, /ISSUE_CREATE_DEDUPLICATED/)
assert.match(issueMutation, /writeGovernanceAudit/)
assert.match(issueMutation, /ISSUE_\$\{status\}/)
assert.match(issueMutation, /ISSUE_RESOLUTION_VERIFICATION_SCHEDULING_FAILED/)

console.log('Data Steward canonical audit/evidence preservation contracts: PASS')
