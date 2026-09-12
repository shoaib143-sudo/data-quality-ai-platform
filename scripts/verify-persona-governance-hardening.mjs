import fs from 'node:fs'

const policy = fs.readFileSync('lib/governance/persona-findings-issues-presentation.ts', 'utf8')
const page = fs.readFileSync('app/issues/page.tsx', 'utf8')
const manager = fs.readFileSync('app/issues/issue-manager.tsx', 'utf8')
const createRoute = fs.readFileSync('app/api/issues/route.ts', 'utf8')
const updateRoute = fs.readFileSync('app/api/issues/[issueId]/route.ts', 'utf8')
const integrity = fs.readFileSync('lib/governance/issue-reference-integrity.ts', 'utf8')
const landing = fs.readFileSync('lib/governance/persona-presentation-view.ts', 'utf8')

const personas = [
  'senior-leadership','business-user','data-owner','data-product-owner','data-steward','data-governance-specialist',
  'compliance-risk-officer','privacy-security-officer','data-governance-admin','data-custodian','source-system-owner',
  'metadata-analyst','data-quality-analyst',
]
for (const persona of personas) if (!policy.includes(`'${persona}'`)) throw new Error(`Missing findings/issues persona policy: ${persona}`)

for (const token of [
  'presentation={presentation}',
  "presentation.primaryFocus",
  'presentation.showOwnership',
  'presentation.showTechnicalContext',
  'projectId=${encodeURIComponent(changedProjectId)}',
]) if (!manager.includes(token) && !page.includes(token)) throw new Error(`Persona issue integration missing: ${token}`)

if (!page.includes(".eq('organization_id', landing.organizationId)")) throw new Error('Issues workspace must be explicitly scoped to the resolved instance organization.')

for (const token of [
  'assertIssueReferencesBelongToProject',
  'assertIssueOwnerBelongsToProjectOrganization',
  'ISSUE_SEVERITIES',
]) if (!createRoute.includes(token)) throw new Error(`Issue creation hardening missing: ${token}`)

for (const token of ['ISSUE_STATUSES', 'ISSUE_SEVERITIES', 'assertIssueOwnerBelongsToProjectOrganization']) {
  if (!updateRoute.includes(token)) throw new Error(`Issue mutation hardening missing: ${token}`)
}

for (const token of [
  'ISSUE_DATASET_PROJECT_MISMATCH',
  'ISSUE_FINDING_RUN_MISMATCH',
  'ISSUE_QUALITY_RULE_PROFILE_RUN_MISMATCH',
  'ISSUE_OWNER_ORGANIZATION_MISMATCH',
]) if (!integrity.includes(token)) throw new Error(`Issue reference integrity contract missing: ${token}`)

if (landing.includes("detail: 'Governed datasets with an accountable owner'")) throw new Error('Landing must not describe partial stewardship assignment coverage as accountable ownership.')
if (!landing.includes("label: 'Stewardship coverage'")) throw new Error('Landing must label assignment-based coverage precisely as stewardship coverage.')

console.log('Persona governance hardening verified for all 13 personas.')
