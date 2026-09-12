import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const remoteActionPattern = /^[^\s@]+@[0-9a-fA-F]{40}$/
const dockerActionPattern = /^docker:\/\/.+@sha256:[0-9a-fA-F]{64}$/
const localActionPattern = /^\.\//
const usesLinePattern = /^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#.*)?$/

export function isImmutableActionRef(actionRef) {
  return localActionPattern.test(actionRef) || remoteActionPattern.test(actionRef) || dockerActionPattern.test(actionRef)
}

export async function collectWorkflowActionViolations(workflowDir = path.resolve('.github/workflows')) {
  const workflowNames = (await readdir(workflowDir))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()

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
      if (isImmutableActionRef(actionRef)) continue

      violations.push({
        workflow: path.relative(process.cwd(), workflowPath).replaceAll('\\', '/'),
        line: index + 1,
        actionRef,
      })
    }
  }

  return { workflowCount: workflowNames.length, references, violations }
}

export async function verifyWorkflowActionPinning(workflowDir = path.resolve('.github/workflows')) {
  const result = await collectWorkflowActionViolations(workflowDir)
  if (result.violations.length > 0) {
    console.error('Mutable or non-verifiable GitHub Action references detected:')
    for (const violation of result.violations) {
      console.error(`- ${violation.workflow}:${violation.line} -> ${violation.actionRef}`)
    }
    console.error('\nRemote actions must be pinned to an exact 40-character commit SHA. Docker actions must use @sha256:<64 hex>. Local ./ actions are allowed.')
    throw new Error(`Workflow action pinning failed with ${result.violations.length} mutable reference(s).`)
  }

  console.log(`Workflow action pinning verified: ${result.workflowCount} workflows, ${result.references} action references, 0 mutable references.`)
  return result
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  try {
    await verifyWorkflowActionPinning()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
