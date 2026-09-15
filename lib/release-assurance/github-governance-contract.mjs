export const REQUIRED_WORKFLOWS = [
  { file: 'quality-gate.yml', name: 'Quality Gate', jobs: ['build'] },
  { file: 'codeql-security.yml', name: 'CodeQL Security', jobs: ['analyze'] },
  { file: 'p0-p4-revalidation.yml', name: 'P0-P5 Revalidation', jobs: ['revalidate'] },
  {
    file: 'v6-operational-certification.yml',
    name: 'V6 Operational Certification',
    jobs: ['certify', 'runtime-slo', 'clean-database-reconstruction'],
  },
  { file: 'dependency-review.yml', name: 'Dependency Security Audit', jobs: ['dependency-audit'] },
  { file: 'repository-governance.yml', name: 'Repository Governance', jobs: ['repository-governance'] },
]

export const REQUIRED_CHECKS = REQUIRED_WORKFLOWS.flatMap(workflow => workflow.jobs)

function nestedBlock(source, key, indent) {
  const lines = source.split(/\r?\n/)
  const prefix = ' '.repeat(indent)
  const start = lines.findIndex(line => line.startsWith(`${prefix}${key}:`))
  if (start < 0) return ''

  const block = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      block.push(line)
      continue
    }
    const leadingSpaces = line.match(/^ */)?.[0].length ?? 0
    if (leadingSpaces <= indent) break
    block.push(line)
  }
  return block.join('\n')
}

function topLevelBlock(source, key) {
  return nestedBlock(source, key, 0)
}

function eventBlock(onBlock, event) {
  return nestedBlock(onBlock, event, 2)
}

function jobBlock(source, job) {
  return nestedBlock(topLevelBlock(source, 'jobs'), job, 2)
}

function targetsMain(block) {
  return /^\s{4}branches:\s*\[\s*main\s*\]\s*$/m.test(block)
    || /^\s{4}branches:\s*\n(?:\s{6}-\s*[^\n]+\n)*?\s{6}-\s*main\s*$/m.test(block)
}

export function validateRequiredWorkflowSource(source, contract) {
  const failures = []
  const onBlock = topLevelBlock(source, 'on')
  const permissions = topLevelBlock(source, 'permissions')
  const concurrency = topLevelBlock(source, 'concurrency')
  const declaredName = source.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim()

  if (declaredName !== contract.name) failures.push(`workflow name must remain ${contract.name}`)
  if (!targetsMain(eventBlock(onBlock, 'push'))) failures.push('push must target main')
  if (!targetsMain(eventBlock(onBlock, 'pull_request'))) failures.push('pull_request must target main')
  if (/^\s{4}paths(?:-ignore)?:/m.test(onBlock)) failures.push('required workflows must not use path filters')
  if (!/^  contents:\s*read\s*$/m.test(permissions)) failures.push('contents permission must be read-only')
  if (!/^  group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\s*$/m.test(concurrency)) {
    failures.push('concurrency must isolate workflow runs by PR or ref')
  }
  if (!/^  cancel-in-progress:\s*\$\{\{ github\.event_name == 'pull_request' \}\}\s*$/m.test(concurrency)) {
    failures.push('only superseded pull request runs may be cancelled')
  }

  for (const job of contract.jobs) {
    const block = jobBlock(source, job)
    if (!block) failures.push(`required check context ${job} is missing`)
    else if (!/^\s{4}timeout-minutes:\s*[1-9][0-9]*\s*$/m.test(block)) failures.push(`${job} must have a positive timeout`)
  }

  return { valid: failures.length === 0, failures }
}

export function validateMainRuleset(ruleset) {
  const failures = []
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : []
  const byType = new Map(rules.map(rule => [rule.type, rule]))

  if (ruleset?.target !== 'branch') failures.push('ruleset target must be branch')
  if (ruleset?.enforcement !== 'active') failures.push('ruleset enforcement must be active')
  if (!ruleset?.conditions?.ref_name?.include?.includes('~DEFAULT_BRANCH')) failures.push('ruleset must target the default branch')
  if (!Array.isArray(ruleset?.bypass_actors) || ruleset.bypass_actors.length !== 0) failures.push('ruleset must not have standing bypass actors')
  for (const type of ['deletion', 'non_fast_forward', 'required_linear_history', 'pull_request', 'required_status_checks']) {
    if (!byType.has(type)) failures.push(`ruleset must include ${type}`)
  }

  const pullRequest = byType.get('pull_request')?.parameters
  if (pullRequest?.required_approving_review_count !== 0) failures.push('single-owner repository must not require an unavailable reviewer')
  if (pullRequest?.required_review_thread_resolution !== true) failures.push('review conversations must be resolved')
  if (pullRequest?.dismiss_stale_reviews_on_push !== true) failures.push('new commits must dismiss stale reviews')

  const status = byType.get('required_status_checks')?.parameters
  if (status?.strict_required_status_checks_policy !== true) failures.push('branches must be current before merge')
  if (status?.do_not_enforce_on_create !== false) failures.push('status checks must apply to new branches')
  const contexts = status?.required_status_checks?.map(check => check.context) ?? []
  for (const context of REQUIRED_CHECKS) {
    if (!contexts.includes(context)) failures.push(`required status check ${context} is missing`)
  }
  if (new Set(contexts).size !== contexts.length) failures.push('required status checks must be unique')

  return { valid: failures.length === 0, failures }
}
