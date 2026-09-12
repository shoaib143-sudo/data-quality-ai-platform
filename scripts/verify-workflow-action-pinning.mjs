import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const workflowDir = path.resolve('.github/workflows')
const workflowNames = (await readdir(workflowDir))
  .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()

const remoteActionPattern = /^[^\s@]+@[0-9a-fA-F]{40}$/
const dockerActionPattern = /^docker:\/\/.+@sha256:[0-9a-fA-F]{64}$/
const localActionPattern = /^\.\//
const usesLinePattern = /^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#.*)?$/

const violations = []
let references = 0

for (const workflowName of workflowNames) {
  const workflowPath = path.join(workflowDir, workflowName)
  const content = await readFile(workflowPath, 'utf8')
  const lines = content.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    const match = line.match(usesLinePattern)
    if (!match) continue

    references += 1
    const actionRef = match[1].trim().replace(/^['"]|['"]$/g, '')

    if (
      localActionPattern.test(actionRef) ||
      remoteActionPattern.test(actionRef) ||
      dockerActionPattern.test(actionRef)
    ) {
      continue
    }

    violations.push({
      workflow: `.github/workflows/${workflowName}`,
      line: index + 1,
      actionRef,
    })
  }
}

if (violations.length > 0) {
  console.error('Mutable or non-verifiable GitHub Action references detected:')
  for (const violation of violations) {
    console.error(`- ${violation.workflow}:${violation.line} -> ${violation.actionRef}`)
  }
  console.error('\nRemote actions must be pinned to an exact 40-character commit SHA. Docker actions must use @sha256:<64 hex>. Local ./ actions are allowed.')
  process.exit(1)
}

console.log(`Workflow action pinning verified: ${workflowNames.length} workflows, ${references} action references, 0 mutable references.`)
