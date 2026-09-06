import fs from 'node:fs'

const foundation = fs.readFileSync('supabase/migrations/20260906093000_governed_business_glossary_semantics.sql', 'utf8')
const refresh = fs.readFileSync('supabase/migrations/20260906093100_refresh_glossary_mappings_after_catalog_publish.sql', 'utf8')
const deprecation = fs.readFileSync('supabase/migrations/20260906093200_deprecate_glossary_authority.sql', 'utf8')
const termsRoute = fs.readFileSync('app/api/glossary/route.ts', 'utf8')
const termRoute = fs.readFileSync('app/api/glossary/[termId]/route.ts', 'utf8')
const mappingsRoute = fs.readFileSync('app/api/glossary/mappings/route.ts', 'utf8')
const mappingReviewRoute = fs.readFileSync('app/api/glossary/mappings/[mappingId]/route.ts', 'utf8')
const page = fs.readFileSync('app/glossary/page.tsx', 'utf8')
const manager = fs.readFileSync('app/glossary/glossary-manager.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Business glossary contract missing: ${label}`)
}
function rejectText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`Business glossary contract violated: ${label}`)
}

requireText(foundation, "status='REFERENCE'", 'bootstrap vocabulary is reference-only')
requireText(foundation, "authority_type='REFERENCE_BOOTSTRAP'", 'bootstrap authority is explicit')
requireText(foundation, 'glossary_term_versions', 'immutable semantic version history')
requireText(foundation, 'change_kind text not null', 'semantic version change evidence')
requireText(foundation, 'published_glossary_terms', 'published semantic read model')
requireText(foundation, 'security_invoker=true', 'RLS-preserving semantic views')
requireText(foundation, "status='APPROVED' and v.authority_type <> 'REFERENCE_BOOTSTRAP'", 'reference concepts excluded from authority')
requireText(foundation, "target_type in ('DATASET','CATALOG_ASSET')", 'dataset and stable catalog mapping targets')
requireText(foundation, 'catalog_identity_key', 'stable catalog identity binding')
requireText(foundation, 'term_version_number', 'mapping approval bound to semantic version')
requireText(foundation, "mapping_status in ('PROPOSED','APPROVED','REJECTED','NEEDS_REVIEW')", 'mapping review lifecycle')
requireText(foundation, "validation_state in ('VALID','UNVERIFIED','STALE')", 'mapping validity evidence')
requireText(foundation, 'refresh_glossary_mapping_validity', 'catalog mapping validity reconciliation')
requireText(foundation, "mapping_status='NEEDS_REVIEW'", 'semantic revisions invalidate prior mapping approval')
requireText(foundation, 'current_business_semantics', 'governed semantic consumption view')

requireText(refresh, 'after update of change_set_hash on catalog.catalog_revisions', 'mapping validity refresh after catalog publication')
requireText(refresh, 'exception when others', 'semantic refresh cannot invalidate physical publication')
requireText(refresh, "raise warning 'Glossary mapping validity refresh failed", 'truthful non-blocking refresh failure')

requireText(deprecation, "current_term.status in ('APPROVED','DRAFT','IN_REVIEW')", 'deprecated terms excluded from current semantic authority')
requireText(deprecation, "elsif new.status='DEPRECATED'", 'deprecation invalidates active mapping approval')
requireText(deprecation, "where term_id=new.id and mapping_status='APPROVED'", 'all approved mappings require review after deprecation')
requireText(deprecation, 'deprecated terms retain history but no longer publish authority', 'deprecation read-model intent')

requireText(termsRoute, "authorizeProject(user.id, projectId, 'glossary.read')", 'project-scoped glossary reads')
requireText(termsRoute, "authorizeProject(user.id, projectId, 'glossary.manage')", 'governed term creation authorization')
requireText(termsRoute, "status: 'DRAFT'", 'new human terms start as draft')
requireText(termsRoute, "authority_type: 'HUMAN_GOVERNED'", 'new terms are human-governed')
rejectText(termsRoute, "status:text(b.status)", 'caller-selected approval status')

requireText(termRoute, "action === 'ADOPT_REFERENCE'", 'explicit reference adoption')
requireText(termRoute, "action === 'SUBMIT_REVIEW'", 'term review submission')
requireText(termRoute, "action === 'APPROVE'", 'explicit term approval')
requireText(termRoute, "action === 'DEPRECATE'", 'term deprecation')
requireText(termRoute, 'Editing published meaning opens a new draft', 'published meaning preserved during revision')
requireText(termRoute, 'Governed glossary terms are not hard-deleted', 'semantic history preservation')

requireText(mappingsRoute, "mapping_status: 'PROPOSED'", 'mappings begin as proposals')
requireText(mappingsRoute, 'approved: false', 'mapping proposal cannot self-approve')
requireText(mappingsRoute, "targetType === 'CATALOG_ASSET'", 'catalog asset mapping support')
requireText(mappingReviewRoute, "action === 'APPROVE'", 'explicit mapping approval')
requireText(mappingReviewRoute, "mapping.validation_state !== 'VALID'", 'stale catalog mappings cannot be approved')
requireText(mappingReviewRoute, "term.status !== 'APPROVED'", 'term must be governed before mapping approval')

requireText(page, 'Reference vocabulary is separated from steward-approved business meaning.', 'truthful glossary positioning')
requireText(manager, 'Reference only', 'reference authority visible in UI')
requireText(manager, 'no published authority', 'published-state evidence visible in UI')
requireText(manager, 'Mapping review queue', 'mapping review workload visible')
requireText(manager, "termAction(item, 'ADOPT_REFERENCE')", 'reference adoption UI')
requireText(manager, "mappingAction(item, mapping, 'APPROVE')", 'mapping approval UI')

console.log('Business glossary and governed semantics contracts verified.')
