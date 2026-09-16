function findIndentedBlock(source, header, indent) {
  const lines = source.split(/\r?\n/)
  const prefix = `${' '.repeat(indent)}${header}:`
  const start = lines.findIndex((line) => line === prefix)
  if (start < 0) return ''

  const block = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') {
      block.push(line)
      continue
    }
    const leading = line.length - line.trimStart().length
    if (leading <= indent) break
    block.push(line)
  }
  return block.join('\n')
}

function branchBlockContains(block, branch) {
  return new RegExp(`branches:\\s*\\[([^\\]]*\\b${branch}\\b[^\\]]*)\\]`).test(block)
    || new RegExp(`(?:^|\\n)\\s*-\\s*${branch}\\s*(?:$|\\n)`).test(block)
}

function jobBlock(source, jobName) {
  const jobs = findIndentedBlock(source, 'jobs', 0)
  return findIndentedBlock(`jobs:\n${jobs}`, jobName, 2)
}

function isPullRequestOnly(block) {
  return /if:\s*github\.event_name\s*==\s*['"]pull_request['"]/.test(block)
}

function isPostMergeOnly(block) {
  return /if:\s*github\.event_name\s*!=\s*['"]pull_request['"]/.test(block)
}

function checkoutUsesEventSha(block) {
  if (!/uses:\s*actions\/checkout@/.test(block)) return false
  const checkoutIndex = block.search(/uses:\s*actions\/checkout@/)
  const afterCheckout = block.slice(checkoutIndex)
  const nextStep = afterCheckout.slice(1).search(/\n\s*-\s+name:/)
  const checkoutStep = nextStep >= 0 ? afterCheckout.slice(0, nextStep + 1) : afterCheckout
  return !/\n\s+ref:\s*/.test(checkoutStep)
}

export function validateExactMainCertificationWorkflow(source, {
  prJobName,
  postMergeJobName,
  jobName,
}) {
  const requiredPrJob = prJobName ?? jobName
  const requiredPostMergeJob = postMergeJobName ?? jobName
  const failures = []
  const onBlock = findIndentedBlock(source, 'on', 0)
  const pushBlock = findIndentedBlock(`on:\n${onBlock}`, 'push', 2)
  const pullRequestBlock = findIndentedBlock(`on:\n${onBlock}`, 'pull_request', 2)
  const permissionsBlock = findIndentedBlock(source, 'permissions', 0)
  const prBlock = requiredPrJob ? jobBlock(source, requiredPrJob) : ''
  const postMergeBlock = requiredPostMergeJob ? jobBlock(source, requiredPostMergeJob) : ''

  if (!pushBlock || !branchBlockContains(pushBlock, 'main')) {
    failures.push('workflow must run automatically on pushes to protected main')
  }
  if (!pullRequestBlock || !branchBlockContains(pullRequestBlock, 'main')) {
    failures.push('workflow must preserve pull_request validation for main')
  }
  if (!requiredPrJob || !prBlock) {
    failures.push(`workflow must publish required PR check context ${requiredPrJob ?? '(missing)'}`)
  } else if (requiredPrJob !== requiredPostMergeJob && !isPullRequestOnly(prBlock)) {
    failures.push(`required PR check context ${requiredPrJob} must be restricted to pull_request events`)
  }
  if (!requiredPostMergeJob || !postMergeBlock) {
    failures.push(`workflow must publish full post-merge certification job ${requiredPostMergeJob ?? '(missing)'}`)
  } else if (requiredPrJob !== requiredPostMergeJob) {
    if (!isPostMergeOnly(postMergeBlock)) {
      failures.push(`full post-merge certification job ${requiredPostMergeJob} must run outside pull_request events`)
    }
    if (!checkoutUsesEventSha(postMergeBlock)) {
      failures.push(`full post-merge certification job ${requiredPostMergeJob} must checkout the triggering event SHA without a ref override`)
    }
  }
  if (!/(?:^|\n)\s*contents:\s*read\s*(?:$|\n)/.test(`permissions:\n${permissionsBlock}`)) {
    failures.push('workflow must retain least-privilege contents: read permissions')
  }

  return { valid: failures.length === 0, failures }
}
