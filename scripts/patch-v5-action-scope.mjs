import fs from 'node:fs'

function replaceOnce(path, before, after) {
  const current = fs.readFileSync(path, 'utf8')
  if (current.includes(after)) return false
  if (!current.includes(before)) throw new Error(`Patch marker not found in ${path}`)
  fs.writeFileSync(path, current.replace(before, after))
}

const path = 'lib/governance/governed-autonomy.ts'
replaceOnce(
  path,
  "import { invalidateGovernedActionOutcome } from '@/lib/governance/governed-action-outcomes'\n",
  "import { invalidateGovernedActionOutcome } from '@/lib/governance/governed-action-outcomes'\nimport { assertGovernedActionReferencesInProject } from '@/lib/governance/governed-action-scope'\n",
)
replaceOnce(
  path,
  "  const confidence = clamp(input.confidence)\n  const policy = await loadPolicy(input.projectId, actionKey)",
  "  const confidence = clamp(input.confidence)\n  await assertGovernedActionReferencesInProject({\n    projectId: input.projectId,\n    targetType,\n    targetId: input.targetId ?? null,\n    sourceAgentRunId: input.sourceAgentRunId ?? null,\n  })\n  const policy = await loadPolicy(input.projectId, actionKey)",
)

const content = fs.readFileSync(path, 'utf8')
if (!content.includes('assertGovernedActionReferencesInProject')) throw new Error('V5 action-scope integration failed.')
console.log('V5 governed action project scope patch applied.')
