import { collectWorkflowActionInventory } from './report-workflow-action-inventory.mjs'

const allowedActions = new Set([
  'actions/attest',
  'actions/checkout',
  'actions/setup-java',
  'actions/setup-node',
  'actions/upload-artifact',
  'github/codeql-action/analyze',
  'github/codeql-action/init',
  'pnpm/action-setup',
])

export async function verifyWorkflowActionAllowlist() {
  const inventory = await collectWorkflowActionInventory()
  const violations = inventory.references
    .filter(reference => reference.kind === 'remote')
    .filter(reference => !allowedActions.has(reference.actionPath))

  if (violations.length > 0) {
    console.error('Unapproved GitHub Action references detected:')
    for (const violation of violations) {
      console.error(`- ${violation.workflow}:${violation.line} -> ${violation.actionRef}`)
    }
    throw new Error(`Workflow action allowlist failed with ${violations.length} unapproved reference(s).`)
  }

  console.log(`Workflow action allowlist verified: ${inventory.remoteReferenceCount} remote references restricted to ${allowedActions.size} approved actions.`)
  return { inventory, allowedActions: [...allowedActions].sort(), violations }
}

try {
  await verifyWorkflowActionAllowlist()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
