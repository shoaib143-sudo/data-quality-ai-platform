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

export function validateExactMainCertificationWorkflow(source, { jobName }) {
  const failures = []
  const onBlock = findIndentedBlock(source, 'on', 0)
  const pushBlock = findIndentedBlock(`on:\n${onBlock}`, 'push', 2)
  const pullRequestBlock = findIndentedBlock(`on:\n${onBlock}`, 'pull_request', 2)
  const jobsBlock = findIndentedBlock(source, 'jobs', 0)
  const permissionsBlock = findIndentedBlock(source, 'permissions', 0)

  if (!pushBlock || !branchBlockContains(pushBlock, 'main')) {
    failures.push('workflow must run automatically on pushes to protected main')
  }
  if (!pullRequestBlock || !branchBlockContains(pullRequestBlock, 'main')) {
    failures.push('workflow must preserve pull_request validation for main')
  }
  if (!new RegExp(`(?:^|\\n)  ${jobName}:\\s*(?:$|\\n)`).test(`jobs:\n${jobsBlock}`)) {
    failures.push(`workflow must publish required check context ${jobName}`)
  }
  if (!/(?:^|\n)\s*contents:\s*read\s*(?:$|\n)/.test(`permissions:\n${permissionsBlock}`)) {
    failures.push('workflow must retain least-privilege contents: read permissions')
  }

  return { valid: failures.length === 0, failures }
}
