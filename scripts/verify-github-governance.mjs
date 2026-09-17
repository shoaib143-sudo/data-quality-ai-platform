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
// 133 is the exact governed ceiling after adding the dedicated secret-safe R2 live certification workflow.
// Keep this fail-closed: any additional workflow still requires an explicit governance change.
const GOVERNED_WORKFLOW_CEILING = 133
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

const ruleset = JSON.parse(await readFile('.github/rulesets/main.json', 'utf8'))
for (const failure of validateMainRuleset(ruleset).failures) failures.push(`main ruleset: ${failure}`)

const dependabot = await readFile('.github/dependabot.yml', 'utf8')
if (!/package-ecosystem:\s*npm/.test(dependabot)) failures.push('Dependabot must manage npm dependencies')
if (!/package-ecosystem:\s*github-actions/.test(dependabot)) failures.push('Dependabot must manage GitHub Actions')
if ((dependabot.match(/interval:\s*weekly/g) ?? []).length < 2) failures.push('Dependabot updates must use a bounded weekly schedule')

const securityPolicy = await readFile('SECURITY.md', 'utf8')
if (!/Do not disclose suspected vulnerabilities in a public issue/i.test(securityPolicy)) failures.push('SECURITY.md must prohibit public vulnerability disclosure')
if (!/credentials, tokens, personal data, and tenant data removed/i.test(securityPolicy)) failures.push('SECURITY.md must require sensitive-data redaction')

if (failures.length > 0) {
  console.error('GitHub repository governance violations detected:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`GitHub repository governance verified: ${workflowFiles.length} uniquely named workflows, ${REQUIRED_WORKFLOWS.length} required workflows, protected main ruleset, Dependabot, and security policy.`)
