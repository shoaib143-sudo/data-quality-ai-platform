import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [lineageLayout,datasetsLayout,policy] = await Promise.all([
  readFile(new URL('../app/lineage/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/datasets/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../lib/governance/workspace-policy.ts', import.meta.url),'utf8'),
])

assert.match(lineageLayout,/canAccessWorkspace\(context\.persona,'lineage-manage',context\.organizationRole\)/,'Lineage presentation must consult lineage-manage policy.')
assert.match(lineageLayout,/a\[href=\\"\/lineage\/ingest\\"\]/,'Lineage ingest action must be suppressed when management access is absent.')
assert.match(datasetsLayout,/canAccessWorkspace\(context\.persona, 'agents', context\.organizationRole\)/,'Datasets presentation must consult agents policy.')
assert.match(datasetsLayout,/canAccessWorkspace\(context\.persona, 'discovery', context\.organizationRole\)/,'Datasets presentation must consult discovery policy.')
assert.match(datasetsLayout,/a\[href=\\"\/agents\\"\]/,'Agents action must be suppressed when access is absent.')
assert.match(datasetsLayout,/a\[href=\\"\/catalog\/discovery\\"\]/,'Discovery action must be suppressed when access is absent.')
assert.match(policy,/'metadata-analyst': \[[^\]]*'lineage'[^\]]*\]/s,'Metadata Analyst must retain read lineage access.')
assert.doesNotMatch(policy,/'metadata-analyst': \[[^\]]*'lineage-manage'/s,'Metadata Analyst must not silently gain lineage-manage.')
assert.match(policy,/'source-system-owner': \[[^\]]*'datasets'[^\]]*\]/s,'Source System Owner must retain datasets access.')
assert.doesNotMatch(policy,/'source-system-owner': \[[^\]]*'agents'/s,'Source System Owner must not silently gain agents access.')
assert.doesNotMatch(policy,/'source-system-owner': \[[^\]]*'discovery'/s,'Source System Owner must not silently gain discovery access.')

console.log('persona workspace link composition contract: PASS')
