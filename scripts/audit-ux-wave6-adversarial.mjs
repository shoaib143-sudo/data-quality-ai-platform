import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages = {
  search: fs.readFileSync('app/search/page.tsx', 'utf8'),
  profile: fs.readFileSync('app/profile/page.tsx', 'utf8'),
  schedules: fs.readFileSync('app/schedules/page.tsx', 'utf8'),
  recovery: fs.readFileSync('app/recovery/page.tsx', 'utf8'),
  documents: fs.readFileSync('app/documents/page.tsx', 'utf8'),
  contracts: fs.readFileSync('app/contracts/page.tsx', 'utf8'),
}

for (const [name, source] of Object.entries(pages)) {
  assert.ok(source.includes('<GlobalUtilityBar'), 'adversarial: ' + name + ' must not regress to an isolated shell')
  assert.ok(source.includes('organizationRole={landing.organizationRole}'), 'adversarial: ' + name + ' shell must receive organization-role context')
}

assert.ok(pages.search.includes('canCatalog?<div'), 'adversarial: Search must not expose Catalog without access')
assert.ok(pages.profile.includes('{canSettings ? <Link href="/settings"'), 'adversarial: Profile must not expose Settings without access')
assert.ok(pages.schedules.includes('canMonitoring?<Link href="/monitoring"'), 'adversarial: Schedules must not expose monitoring without access')
assert.ok(pages.recovery.includes('{canAgents ? <Link href={`/agents/runs/'), 'adversarial: Recovery must not expose agent-run deep links without access')
assert.ok(pages.documents.includes('canCatalog?<Link key={String(label)}'), 'adversarial: Documents must not turn evidence tiles into inaccessible dataset links')
assert.ok(pages.documents.includes('canProfiling&&selected.profile_run_id?<Link'), 'adversarial: Documents profiling link requires both access and evidence')
assert.ok(pages.contracts.includes('canIssues?<Link href="/issues"'), 'adversarial: Contracts must not expose Issues without access')

assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(pages.search), 'adversarial: Search shell migration must remain read only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(pages.profile), 'adversarial: Profile shell migration must remain read only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(pages.documents), 'adversarial: Documents shell migration must remain read only')

console.log('Independent Wave 6 UX adversarial audit passed.')
