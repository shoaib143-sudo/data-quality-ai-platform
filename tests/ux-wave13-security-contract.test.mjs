import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

const surfaces = [
  'app/admin/ai-command-center/traces/page.tsx',
  'app/admin/ai-command-center/retrieval-evaluation/page.tsx',
  'app/agents/[agentKey]/[version]/page.tsx',
  'app/agents/runs/[runId]/page.tsx',
  'app/agents/autonomous-governance/page.tsx',
  'app/datasets/dataset/[datasetId]/edit/page.tsx',
  'app/datasets/edit/[sourceId]/page.tsx',
  'app/admin/page.tsx',
  'app/ai-insights/page.tsx',
]

test('Wave 13 residual surfaces retain shared shell and focus targets', () => {
  for (const path of surfaces) {
    const source = read(path)
    assert.ok(source.includes('<GlobalUtilityBar'), path + ' missing shared shell')
    assert.ok(source.includes('id="main-content"'), path + ' missing main-content target')
    assert.ok(source.includes('tabIndex={-1}'), path + ' missing focusable target')
  }
})

test('source registration writes require source.manage', () => {
  const source = read('app/api/datasets/source/register/route.ts')
  assert.ok(source.includes("authorizeProject(user.id, projectId, 'source.manage')"))
  assert.ok(!source.includes("authorizeProject(user.id, projectId, 'catalog.read')"))
})

test('agent run evidence remains fail-closed', () => {
  const source = read('app/agents/runs/[runId]/page.tsx')
  assert.ok(source.includes('canViewExecutionRun'))
  assert.ok(source.includes("'execution.view_evidence'"))
  assert.ok(source.includes('catch {\n    notFound()'))
})

test('shared skip link bypasses repeated utility navigation', () => {
  const source = read('components/app-shell/global-utility-bar.tsx')
  const skipIndex = source.indexOf('<SkipToContent targetId="workspace-content-start" />')
  const headerIndex = source.indexOf('<header')
  const targetIndex = source.indexOf('<div id="workspace-content-start"')
  assert.ok(skipIndex >= 0)
  assert.ok(headerIndex > skipIndex)
  assert.ok(targetIndex > headerIndex)
})
