import assert from 'node:assert/strict'

const runs = [
  { id: 'r3', project_id: 'p1', dataset_id: 'd1', agent_definition_id: 'quality', status: 'COMPLETED', created_at: '2026-09-14T00:03:00Z' },
  { id: 'r2', project_id: 'p1', dataset_id: 'd1', agent_definition_id: 'quality', status: 'FAILED', created_at: '2026-09-14T00:02:00Z' },
  { id: 'r1', project_id: 'p1', dataset_id: 'd2', agent_definition_id: 'profiling', status: 'RUNNING', created_at: '2026-09-14T00:01:00Z' },
  { id: 'r4', project_id: 'p2', dataset_id: 'd3', agent_definition_id: 'quality', status: 'RUNNING', created_at: '2026-09-14T00:04:00Z' },
  { id: 'r5', project_id: 'p1', dataset_id: null, agent_definition_id: 'governance', status: 'QUEUED', created_at: '2026-09-14T00:00:00Z' },
]
const datasets = new Map([
  ['d1', { business_domain: 'Customer' }],
  ['d2', { business_domain: 'Customer' }],
  ['d3', { business_domain: 'Customer' }],
])

const domainFor = (run) => run.dataset_id ? datasets.get(run.dataset_id)?.business_domain?.trim() || 'Unassigned Data Domain' : 'Unassigned Data Domain'
const groups = new Map()
for (const run of runs) {
  const domainName = domainFor(run)
  const key = run.project_id + '::' + domainName
  groups.set(key, [...(groups.get(key) ?? []), run])
}

assert.equal(groups.size, 3, 'same domain label in different governed project scopes must not merge')
assert.equal(groups.get('p1::Customer').length, 3, 'same project and persisted domain must group together')
assert.equal(groups.get('p1::Unassigned Data Domain').length, 1, 'missing domain metadata must remain explicitly unassigned')

const latestByComponent = (rows) => {
  const latest = new Map()
  for (const row of rows) if (!latest.has(row.agent_definition_id)) latest.set(row.agent_definition_id, row)
  return [...latest.values()]
}
const customerComponents = latestByComponent(groups.get('p1::Customer'))
assert.equal(customerComponents.length, 2, 'repeated runs from one component must collapse to the latest execution state')
assert.equal(customerComponents.find((row) => row.agent_definition_id === 'quality')?.id, 'r3', 'latest component state must win over an older failure')

console.log('Domain Cell grouping unit tests passed: persisted domain grouping, project isolation, unassigned metadata, and latest-component state.')


const organicPosition = (index, total) => {
  const ringCount = total > 16 ? 3 : total > 8 ? 2 : 1
  const ring = index % ringCount
  const slotIndex = Math.floor(index / ringCount)
  const slotCount = Math.max(1, Math.ceil(total / ringCount))
  const angle = (slotIndex / slotCount) * Math.PI * 2 - Math.PI / 2 + (ring * Math.PI) / Math.max(slotCount, 2)
  const radii = ringCount === 1 ? [39] : ringCount === 2 ? [31, 43] : [27, 36, 45]
  const radius = radii[ring]
  return { left: 50 + Math.cos(angle) * radius, top: 53 + Math.sin(angle) * radius * 0.82 }
}

for (const total of [1, 8, 9, 17, 24]) {
  const positions = Array.from({ length: total }, (_, index) => organicPosition(index, total))
  assert.equal(positions.length, total, 'every component must receive an organic position')
  assert.equal(new Set(positions.map((position) => `${position.left.toFixed(4)}:${position.top.toFixed(4)}`)).size, total, 'component placement must not collapse distinct nodes')
  for (const position of positions) {
    assert.ok(position.left >= 5 && position.left <= 95, 'organic node must remain inside horizontal membrane bounds')
    assert.ok(position.top >= 10 && position.top <= 90, 'organic node must remain inside vertical membrane bounds')
  }
}

console.log('Domain Cell organic placement tests passed: every component receives a deterministic in-membrane position across one, two, and three-ring layouts.')
