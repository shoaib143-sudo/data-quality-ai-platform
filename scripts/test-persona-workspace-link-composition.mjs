import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [lineageLayout,datasetsLayout,catalogPage,physicalAssetsPage,policy] = await Promise.all([
  readFile(new URL('../app/lineage/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/datasets/layout.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/catalog/page.tsx', import.meta.url),'utf8'),
  readFile(new URL('../app/catalog/physical-assets/page.tsx', import.meta.url),'utf8'),
  readFile(new URL('../lib/governance/workspace-policy.ts', import.meta.url),'utf8'),
])

assert.match(lineageLayout,/canAccessWorkspace\(context\.persona,'lineage-manage',context\.organizationRole\)/,'Lineage presentation must consult lineage-manage policy.')
assert.ok(lineageLayout.includes('a[href="/lineage/ingest"]'),'Lineage ingest action must be suppressible when management access is absent.')
assert.match(datasetsLayout,/canAccessWorkspace\(context\.persona, 'agents', context\.organizationRole\)/,'Datasets presentation must consult agents policy.')
assert.match(datasetsLayout,/canAccessWorkspace\(context\.persona, 'discovery', context\.organizationRole\)/,'Datasets presentation must consult discovery policy.')
assert.ok(datasetsLayout.includes('a[href="/agents"]'),'Agents action must be suppressible when access is absent.')
assert.ok(datasetsLayout.includes('a[href="/catalog/discovery"]'),'Discovery action must be suppressible when access is absent.')
assert.match(catalogPage,/canAccessWorkspace\(landing\.persona,'discovery',landing\.organizationRole\)&&capabilityRows\.some/,'Catalog Discovery presentation must require both workspace policy and project capability.')
assert.match(catalogPage,/\{canDiscover\?<Link href="\/catalog\/discovery"/,'Catalog Discovery link must remain presentation-gated.')
assert.match(physicalAssetsPage,/const canDashboard = canAccessWorkspace\(landing\.persona, 'dashboard', landing\.organizationRole\)/,'Physical Assets must resolve the dashboard destination through persona policy.')
assert.match(physicalAssetsPage,/const canDiscovery = canAccessWorkspace\(landing\.persona, 'discovery', landing\.organizationRole\)/,'Physical Assets must consult Discovery workspace policy.')
assert.match(physicalAssetsPage,/href=\{canDashboard \? '\/dashboard' : '\/home'\}/,'Physical Assets branding destination must not send a denied persona to Dashboard.')
assert.match(physicalAssetsPage,/\{canDiscovery \? <Link href="\/catalog\/discovery"/,'Physical Assets Discovery action must be presentation-gated.')
assert.match(physicalAssetsPage,/>DataNexus AI<\/Link>/,'Physical Assets must use canonical product branding.')
assert.match(policy,/'metadata-analyst': \[[^\]]*'lineage'[^\]]*\]/s,'Metadata Analyst must retain read lineage access.')
assert.doesNotMatch(policy,/'metadata-analyst': \[[^\]]*'lineage-manage'/s,'Metadata Analyst must not silently gain lineage-manage.')
assert.match(policy,/'source-system-owner': \[[^\]]*'datasets'[^\]]*\]/s,'Source System Owner must retain datasets access.')
assert.doesNotMatch(policy,/'source-system-owner': \[[^\]]*'agents'/s,'Source System Owner must not silently gain agents access.')
assert.doesNotMatch(policy,/'source-system-owner': \[[^\]]*'discovery'/s,'Source System Owner must not silently gain discovery access.')
assert.doesNotMatch(policy,/'senior-leadership': \[[^\]]*'discovery'/s,'Senior Leadership must not silently gain Discovery workspace access.')

console.log('persona workspace link composition contract: PASS')
