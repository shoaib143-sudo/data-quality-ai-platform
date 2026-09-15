import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workflowRoot = path.resolve('.github/workflows')

export async function verifyWorkflowSecurityPosture(root = workflowRoot) {
  const workflowNames = (await readdir(root))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()

  const violations = []
  for (const workflowName of workflowNames) {
    const workflowPath = path.join(root, workflowName)
    const source = await readFile(workflowPath, 'utf8')
    const lines = source.split(/\r?\n/)

    const hasExplicitPermissions = lines.some(line => /^\s*permissions\s*:/.test(line))
    if (!hasExplicitPermissions) {
      violations.push({ workflowName, reason: 'missing explicit GITHUB_TOKEN permissions' })
    }

    if (lines.some(line => /^\s*permissions\s*:\s*write-all\s*(?:#.*)?$/.test(line))) {
      violations.push({ workflowName, reason: 'permissions: write-all is forbidden' })
    }

    for (const line of lines) {
      const sensitiveSecret = line.match(/^(\s*)([A-Z0-9_]*(?:SERVICE_ROLE|TOKEN|SECRET|PRIVATE_KEY)[A-Z0-9_]*)\s*:\s*\$\{\{\s*secrets\./)
      if (sensitiveSecret && sensitiveSecret[1].length < 10) {
        violations.push({
          workflowName,
          reason: `sensitive credential ${sensitiveSecret[2]} must be scoped to a single step, not a workflow or job`,
        })
      }
    }

    if (lines.some(line => /^\s*pull_request_target\s*:/.test(line))) {
      violations.push({ workflowName, reason: 'pull_request_target requires a separately governed exception and is not permitted by the baseline' })
    }
  }

  if (violations.length > 0) {
    console.error('Workflow security posture violations detected:')
    for (const violation of violations) console.error(`- ${violation.workflowName}: ${violation.reason}`)
    throw new Error(`Workflow security posture failed with ${violations.length} violation(s).`)
  }

  console.log(`Workflow security posture verified: ${workflowNames.length} workflows, explicit token permissions present, sensitive credentials step-scoped, no write-all, no pull_request_target.`)
  return { workflowCount: workflowNames.length, violations }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  try {
    await verifyWorkflowSecurityPosture()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
