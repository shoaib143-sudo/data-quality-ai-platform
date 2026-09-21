import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('components/app-shell/global-utility-bar.tsx', 'utf8')
const required = [
  ["'/dashboard'", "label: 'Dashboard'"],
  ["'/catalog'", "label: 'Data'"],
  ["'/data-quality'", "label: 'Quality'"],
  ["'/journeys'", "label: 'Governance'"],
  ["'/agents'", "label: 'Automation'"],
  ["'/monitoring'", "label: 'Monitor'"],
  ["'/approvals'", "label: 'Approvals'"],
  ["'/admin'", "label: 'Admin'"],
]
for (const [href, label] of required) {
  assert.ok(source.includes(`href: ${href}`), `missing global nav href ${href}`)
  assert.ok(source.includes(label), `missing global nav label ${label}`)
}
assert.ok(source.includes('canAccessWorkspaceHref(persona, item.href, organizationRole)'), 'persona authorization must filter global navigation')
assert.ok(source.indexOf("label: 'Data'") < source.indexOf("label: 'Quality'"), 'Data must precede Quality in the primary journey')
assert.ok(source.indexOf("label: 'Quality'") < source.indexOf("label: 'Governance'"), 'Quality must precede Governance in the primary journey')
assert.ok(source.indexOf("label: 'Governance'") < source.indexOf("label: 'Automation'"), 'Governance must precede Automation in the primary journey')
assert.ok(source.includes('focus-visible:ring-2'), 'global navigation must retain keyboard focus affordance')
assert.ok(source.includes('overflow-x-auto'), 'primary navigation must remain usable on narrow viewports')
assert.ok(source.includes('aria-label="Primary"'), 'primary navigation must retain an accessible label')
assert.ok(source.includes('aria-label="Search DataNexus"'), 'search CTA must remain accessible')
assert.ok(source.includes('aria-label="Open governance inbox"'), 'inbox CTA must remain accessible')
console.log('Product shell UX contract passed.')