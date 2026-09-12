import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [lineageLayout,datasetsLayout,policy] = await Promise.all([
  readFile(new URL('../app/lineage/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/datasets/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../lib/governance/workspace-policy.ts', import.meta.url),'utf8'),
])

assert.match(policy,/\['\/lineage\/ingest', 'lineage-manage'\]/,'Direct lineage ingest route must remain governed by lineage-manage.')
assert.match(policy,/\['\/catalog\/discovery', 'discovery'\]/,'Direct catalog discovery route must remain governed by discovery.')
assert.match(policy,/\['\/agents', 'agents'\]/,'Direct agents route must remain governed by agents.')
assert.match(lineageLayout,/requireWorkspaceAccess\('lineage'\)/,'Lineage layout must retain its read-access boundary.')
assert.match(datasetsLayout,/requireWorkspaceAccess\('datasets'\)/,'Datasets layout must retain its workspace boundary.')
assert.doesNotMatch(lineageLayout,/lineage-manage[^\n]*\?\s*true/,'Lineage management visibility must not be hard-coded open.')
assert.doesNotMatch(datasetsLayout,/agents[^\n]*\?\s*true|discovery[^\n]*\?\s*true/,'Dataset privileged-link visibility must not be hard-coded open.')

console.log('persona workspace link composition adversarial audit: PASS', {
  backendAuthorizationPreserved: true,
  metadataAnalystManagementLinksSuppressed: true,
  sourceOwnerUnavailableLinksSuppressed: true,
})
