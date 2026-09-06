import fs from 'node:fs'

const foundation = fs.readFileSync('supabase/migrations/20260906110000_governed_ownership_stewardship.sql', 'utf8')
const lifecycleFix = fs.readFileSync('supabase/migrations/20260906110100_fix_stewardship_subject_refresh.sql', 'utf8')
const assignmentRoute = fs.readFileSync('app/api/stewardship/assignments/route.ts', 'utf8')
const assignmentActionRoute = fs.readFileSync('app/api/stewardship/assignments/[assignmentId]/route.ts', 'utf8')
const page = fs.readFileSync('app/stewardship/page.tsx', 'utf8')
const manager = fs.readFileSync('app/stewardship/stewardship-manager.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Ownership/stewardship contract missing: ${label}`)
}
function rejectText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`Ownership/stewardship contract violated: ${label}`)
}

requireText(foundation, "target_type in ('DATASET','CATALOG_ASSET')", 'dataset and stable catalog targets')
requireText(foundation, 'catalog_identity_key', 'catalog identity continuity')
requireText(foundation, "role in ('BUSINESS_OWNER','TECHNICAL_OWNER','DATA_STEWARD','CUSTODIAN')", 'explicit responsibility roles')
requireText(foundation, "origin <> 'AI_SUGGESTED' or status='PROPOSED'", 'AI cannot silently activate ownership')
requireText(foundation, 'stewardship_dataset_business_owner_unique', 'single accountable business owner per current dataset')
requireText(foundation, 'stewardship_catalog_business_owner_unique', 'single accountable business owner per current catalog identity')
requireText(foundation, 'stewardship_assignment_events', 'append-only assignment evidence')
requireText(foundation, 'stewardship_assignment_events_append_only', 'assignment evidence immutability')
requireText(foundation, 'capture_stewardship_assignment_evidence', 'transactional assignment evidence capture')
requireText(foundation, 'STEWARDSHIP_ASSIGNED', 'hash-chained assignment audit event')
requireText(foundation, 'STEWARDSHIP_REVOKED', 'hash-chained revocation audit event')
requireText(foundation, 'Stewardship assignments are governed history and cannot be hard-deleted', 'no destructive assignment deletion')
requireText(foundation, 'refresh_stewardship_catalog_validity', 'stable catalog target refresh')
requireText(foundation, 'catalog_revision_refresh_stewardship', 'catalog publication refresh trigger')
requireText(foundation, "raise warning 'Stewardship target validity refresh failed", 'stewardship refresh cannot block physical publication')
requireText(foundation, 'organization_membership_refresh_stewardship', 'assignee membership lifecycle evidence')
requireText(foundation, 'dataset_delete_refresh_stewardship', 'dataset retirement preserves assignment history')
requireText(foundation, 'current_stewardship_assignments', 'current effective assignment read model')
requireText(foundation, 'stewardship_dataset_coverage', 'dataset accountability coverage')
requireText(foundation, 'stewardship_catalog_coverage', 'catalog accountability coverage')
requireText(foundation, 'authenticated_direct_write', 'direct authenticated mutation posture check')
requireText(foundation, 'Source-native owner metadata remains source evidence and is never overwritten', 'source owner authority separation')
requireText(foundation, 'revoke insert,update,delete on governance.stewardship_assignments from authenticated', 'governed server write boundary')
requireText(foundation, 'revoke all on governance.stewardship_assignment_events from anon,authenticated,service_role', 'history cannot be forged by application roles')

requireText(lifecycleFix, "new.status in ('PROPOSED','ACTIVE') and new.subject_state='CURRENT'", 'system deprovision refresh is not blocked by membership validation')
requireText(lifecycleFix, "v_assignment_decision_changed:=tg_op='INSERT'", 'human actor validation applies to governance decisions, not system refresh')

requireText(assignmentRoute, "authorizeProject(user.id, projectId, 'stewardship.manage')", 'stewardship capability authorization')
requireText(assignmentRoute, "targetType === 'CATALOG_ASSET'", 'catalog assignment API')
requireText(assignmentRoute, "origin: 'HUMAN'", 'human assignment authority provenance')
requireText(assignmentRoute, "status: 'ACTIVE'", 'explicit assignment activation')
requireText(assignmentRoute, 'assigned_by: user.id', 'accountable assigning actor')
requireText(assignmentRoute, 'Assignment evidence and audit are captured by DB triggers', 'transactional API evidence')
rejectText(assignmentRoute, 'writeGovernanceAudit', 'best-effort audit helper used for stewardship assignment')
rejectText(assignmentRoute, '.upsert(', 'assignment tenure overwritten by upsert')

requireText(assignmentActionRoute, "action === 'REVOKE'", 'explicit revocation action')
requireText(assignmentActionRoute, "action === 'UPDATE_ACCOUNTABILITY'", 'accountability changes are governed')
requireText(assignmentActionRoute, 'Stewardship assignments are not hard-deleted', 'API preserves assignment history')
requireText(assignmentActionRoute, 'hash-chained audit event', 'review actions use transactional evidence')

requireText(page, 'Ownership &amp; Stewardship', 'stewardship workbench positioning')
requireText(page, 'Source-native owner metadata remains source evidence and is never overwritten.', 'UI authority truth')
requireText(page, "from('stewardship_dataset_coverage')", 'UI consumes dataset coverage evidence')
requireText(page, "from('stewardship_catalog_coverage')", 'UI consumes catalog coverage evidence')
requireText(manager, 'Current catalog asset', 'catalog identity assignment UI')
requireText(manager, 'Accountable means both a current business owner and a current data steward are present.', 'coverage semantics are explainable')
requireText(manager, 'AI may suggest a candidate later, but it cannot silently activate an owner or steward.', 'AI authority boundary visible')
requireText(manager, 'Assignment revoked. History and audit evidence were preserved.', 'revocation history visible')
requireText(manager, 'Certification remains a separate governed decision', 'stewardship does not imply certification')

console.log('Governed ownership and stewardship contracts verified.')
