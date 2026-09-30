import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('components/app-shell/global-utility-bar.tsx', 'utf8')
const navigation = fs.readFileSync('components/app-shell/workspace-navigation.ts', 'utf8')
const required = [
  ["'/dashboard'", "shortLabel: 'Dashboard'"],
  ["'/catalog'", "shortLabel: 'Data'"],
  ["'/data-quality'", "shortLabel: 'Quality'"],
  ["'/journeys'", "shortLabel: 'Governance'"],
  ["'/agents'", "shortLabel: 'AI Agents'"],
  ["'/monitoring'", "shortLabel: 'Monitor'"],
  ["'/approvals'", "shortLabel: 'Approvals'"],
  ["'/admin'", "shortLabel: 'Admin'"],
]
for (const [href, label] of required) {
  assert.ok(navigation.includes(`href: ${href}`), `missing global nav href ${href}`)
  assert.ok(navigation.includes(label), `missing global nav label ${label}`)
}

for (const routeFile of [
  'app/dashboard/page.tsx',
  'app/catalog/page.tsx',
  'app/data-quality/page.tsx',
  'app/journeys/page.tsx',
  'app/agents/page.tsx',
  'app/monitoring/page.tsx',
  'app/approvals/page.tsx',
  'app/admin/page.tsx',
]) assert.ok(fs.existsSync(routeFile), `global navigation target does not exist: ${routeFile}`)
assert.ok(source.includes("workspaceNavItems.filter(item => canAccessWorkspaceHref(persona, item.href, organizationRole))"), 'persona authorization must filter global navigation')
assert.ok(navigation.indexOf("shortLabel: 'Data'") < navigation.indexOf("shortLabel: 'Quality'"), 'Data must precede Quality in the primary journey')
assert.ok(navigation.indexOf("shortLabel: 'Quality'") < navigation.indexOf("shortLabel: 'Governance'"), 'Quality must precede Governance in the primary journey')
assert.ok(navigation.indexOf("shortLabel: 'Governance'") < navigation.indexOf("shortLabel: 'AI Agents'"), 'Governance must precede AI Agents in the primary journey')
assert.ok(source.includes('focus-visible:ring-2'), 'global navigation must retain keyboard focus affordance')
assert.ok(source.includes('overflow-x-auto'), 'primary navigation must remain usable on narrow viewports')
assert.ok(source.includes('aria-label="Primary"'), 'primary navigation must retain an accessible label')
assert.ok(source.includes('aria-label="Search DataNexus"'), 'search CTA must remain accessible')
assert.ok(source.includes('aria-label="Open governance inbox"'), 'inbox CTA must remain accessible')
assert.ok(source.includes('aria-current={active ? \'page\' : undefined}'), 'primary workspace links must expose the current page')
assert.ok(navigation.includes("if (href === '/dashboard') return pathname === href"), 'dashboard active-state matching must not swallow unrelated routes')
console.log('Product shell UX contract passed.')
