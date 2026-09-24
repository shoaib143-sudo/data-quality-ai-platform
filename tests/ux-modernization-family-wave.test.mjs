import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path,'utf8')

test('authentication routes share the modern DataNexus auth shell', () => {
  for (const path of ['app/login/page.tsx','app/signup/page.tsx','app/forgot-password/page.tsx','app/reset-password/page.tsx']) {
    const source = read(path)
    assert.match(source,/AuthShell/)
    assert.match(source,/authFieldClass/)
    assert.match(source,/authPrimaryButtonClass/)
  }
  const shell = read('components/auth/auth-shell.tsx')
  assert.match(shell,/Governed intelligence workspace/)
  assert.match(shell,/Object-centered Data 360/)
  assert.match(shell,/Policy-aware AI assistance/)
})

test('daily work surfaces prioritize attention and compact density', () => {
  const dashboard = read('app/dashboard/page.tsx')
  const inbox = read('app/inbox/page.tsx')
  assert.match(dashboard,/aria-label="Attention now"/)
  assert.match(dashboard,/dn-kpi dn-interactive/)
  assert.match(inbox,/grid auto-rows-fr gap-3/)
  assert.match(inbox,/dn-surface/)
})

test('metadata and lineage workspaces use compact contextual rails', () => {
  for (const path of ['app/glossary/page.tsx','app/stewardship/page.tsx','app/classification/page.tsx','app/contracts/page.tsx','app/lineage/page.tsx','app/lineage/impact/page.tsx']) {
    assert.match(read(path),/dn-(?:glass-rail|surface)/)
  }
  assert.match(read('app/lineage/page.tsx'),/never infers lineage that is not persisted/)
})

test('personal and admin surfaces share the modernized design foundation', () => {
  assert.match(read('app/profile/page.tsx'),/dn-surface/)
  assert.match(read('app/settings/page.tsx'),/dn-surface/)
  assert.match(read('app/admin/page.tsx'),/dn-glass-rail/)
  assert.match(read('app/admin/ai-command-center/page.tsx'),/grid auto-rows-fr gap-3 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5/)
})
