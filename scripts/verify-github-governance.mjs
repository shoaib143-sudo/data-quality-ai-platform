import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  REQUIRED_WORKFLOWS,
  validateMainRuleset,
  validateRequiredWorkflowSource,
} from '../lib/release-assurance/github-governance-contract.mjs'

const workflowRoot = path.resolve('.github/workflows')
const failures = []
const workflowFiles = (await readdir(workflowRoot)).filter(name => /\.ya?ml$/.test(name)).sort()
// 132 is the exact governed ceiling after adding the dedicated Storage R2 Assurance workflow.
// Keep this fail-closed: any additional workflow still requires an explicit governance change.
const GOVERNED_WORKFLOW_CEILING = 132
if (workflowFiles.length > GOVERNED_WORKFLOW_CEILING) {
  failures.push(`workflow count ${workflowFiles.length} exceeds the governed ceiling of ${GOVERNED_WORKFLOW_CEILING}`)
}

const names = new Map()
for (const file of workflowFiles) {
  const source = await readFile(path.join(workflowRoot, file), 'utf8')
  const name = source.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim()
  if (!name) failures.push(`${file}: workflow name is missing`)
  else if (names.has(name)) failures.push(`${file}: workflow name duplicates ${names.get(name)}`)
  else names.set(name, file)
}

for (const contract of REQUIRED_WORKFLOWS) {
  const source = await readFile(path.join(workflowRoot, contract.file), 'utf8')
  const result = validateRequiredWorkflowSource(source, contract)
  for (const failure of result.failures) failures.push(`${contract.file}: ${failure}`)
}

const releaseGovernance = await readFile('.github/workflows/release-governance.yml', 'utf8')
const releaseContracts = [
  ['manual Vercel production deploy operation', /- vercel-production-deploy/],
  ['governed Vercel production deploy job', /\n  deploy-vercel-production:/],
  ['staged production deployment without domain promotion', /--prod\s+--skip-domain/],
  ['authenticated immutable deployment identity check', /vercel curl \/api\/build-info/],
  ['deployed artifact provenance verification', /vercel curl \/\.well-known\/deployed-artifact-provenance\.json[\s\S]*--scope "\$VERCEL_SCOPE"/],
  ['verified deployment promotion', /Promote verified staged deployment to Production/],
  ['Vercel promote command', /vercel --token "\$VERCEL_TOKEN" --scope "\$VERCEL_SCOPE" promote "\$DEPLOYMENT_URL" --yes/],
  ['production liveness verification', /\/api\/health\/live/],
  ['production Supabase verification', /\/api\/health\/supabase/],
  ['production release schema verification', /\/api\/health\/release-schema/],
  ['production readiness verification', /\/api\/health\/ready/],
  ['durable release evidence generation', /evidenceKind: 'VERCEL_PRODUCTION_RELEASE'/],
  ['pinned release evidence upload', /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/],
]
for (const [label, pattern] of releaseContracts) {
  if (!pattern.test(releaseGovernance)) failures.push(`release governance sentinel: missing ${label}`)
}

if (/vercel --token "\$VERCEL_TOKEN"[\s\S]{0,80}curl/.test(releaseGovernance)) {
  failures.push('release governance sentinel: vercel curl must authenticate through VERCEL_TOKEN environment, not --token forwarding')
}

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'))
if (vercelConfig.git?.deploymentEnabled !== false) {
  failures.push('release governance sentinel: automatic Vercel Git deployments must remain disabled')
}

const ruleset = JSON.parse(await readFile('.github/rulesets/main.json', 'utf8'))
for (const failure of validateMainRuleset(ruleset).failures) failures.push(`main ruleset: ${failure}`)

const dependabot = await readFile('.github/dependabot.yml', 'utf8')
if (!/package-ecosystem:\s*npm/.test(dependabot)) failures.push('Dependabot must manage npm dependencies')
if (!/package-ecosystem:\s*github-actions/.test(dependabot)) failures.push('Dependabot must manage GitHub Actions')
if ((dependabot.match(/interval:\s*weekly/g) ?? []).length < 2) failures.push('Dependabot updates must use a bounded weekly schedule')

const releaseDocs = await readFile('docs/release-governance.md', 'utf8')
if (!releaseDocs.includes('.github/workflows/release-governance.yml')) failures.push('release governance docs must reference the integrated Release Governance workflow')
if (!releaseDocs.includes('operation=vercel-production-deploy')) failures.push('release governance docs must name the governed Vercel deployment operation')
if (/vercel-production-deploy\.yml/.test(releaseDocs)) failures.push('release governance docs must not reference the retired standalone Vercel workflow')
if (/confirm_deploy=true/.test(releaseDocs)) failures.push('release governance docs must not require the retired confirm_deploy input')

const securityPolicy = await readFile('SECURITY.md', 'utf8')
if (!/Do not disclose suspected vulnerabilities in a public issue/i.test(securityPolicy)) failures.push('SECURITY.md must prohibit public vulnerability disclosure')
if (!/credentials, tokens, personal data, and tenant data removed/i.test(securityPolicy)) failures.push('SECURITY.md must require sensitive-data redaction')

if (failures.length > 0) {
  console.error('GitHub repository governance violations detected:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`GitHub repository governance verified: ${workflowFiles.length} uniquely named workflows, ${REQUIRED_WORKFLOWS.length} required workflows, protected main ruleset, Dependabot, and security policy.`)
