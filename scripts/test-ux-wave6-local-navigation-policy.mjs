import assert from 'node:assert/strict'
import fs from 'node:fs'

const search = fs.readFileSync('app/search/page.tsx', 'utf8')
const profile = fs.readFileSync('app/profile/page.tsx', 'utf8')
const schedules = fs.readFileSync('app/schedules/page.tsx', 'utf8')
const recovery = fs.readFileSync('app/recovery/page.tsx', 'utf8')
const documents = fs.readFileSync('app/documents/page.tsx', 'utf8')
const contracts = fs.readFileSync('app/contracts/page.tsx', 'utf8')

assert.ok(search.includes("canAccessWorkspaceHref(landing.persona,'/catalog'"), 'Search Catalog CTA must derive from workspace policy')
assert.ok(search.includes('canCatalog?<div'), 'Search Catalog CTA must fail closed')

assert.ok(profile.includes("canAccessWorkspaceHref(landing.persona, '/settings'"), 'Profile Settings CTA must derive from workspace policy')
assert.ok(profile.includes('{canSettings ? <Link href="/settings"'), 'Profile Settings CTA must fail closed')

assert.ok(schedules.includes("canAccessWorkspaceHref(landing.persona,'/monitoring'"), 'Schedules Job Monitor CTA must derive from workspace policy')
assert.ok(schedules.includes("canAccessWorkspaceHref(landing.persona,'/data-quality'"), 'Schedules Data Quality CTA must derive from workspace policy')
assert.ok(schedules.includes('canMonitoring?<Link href="/monitoring"'), 'Schedules Job Monitor CTA must fail closed')
assert.ok(schedules.includes('canQuality?<Link href="/data-quality"'), 'Schedules Data Quality CTA must fail closed')

assert.ok(recovery.includes("canAccessWorkspaceHref(landing.persona, '/agents'"), 'Recovery agent navigation must derive from workspace policy')
assert.ok(recovery.includes('{canAgents ? <Link href="/agents"'), 'Recovery Agents CTA must fail closed')
assert.ok(recovery.includes('{canAgents ? <Link href={`/agents/runs/'), 'Recovery agent-run deep link must fail closed')

for (const [name, route] of [['Catalog','/catalog'],['Search','/search'],['Profiling','/profiling/explorer']]) {
  assert.ok(documents.includes("canAccessWorkspaceHref(landing.persona, '" + route + "'"), 'Documents ' + name + ' navigation must derive from workspace policy')
}
assert.ok(documents.includes('canCatalog?<Link href="/catalog"'), 'Documents Catalog CTA must fail closed')
assert.ok(documents.includes('canSearch?<Link href="/search"'), 'Documents Search CTA must fail closed')
assert.ok(documents.includes('canProfiling&&selected.profile_run_id?<Link'), 'Documents profiling deep link must fail closed')
assert.ok(documents.includes('canCatalog?<Link key={String(label)}'), 'Documents dataset metric tiles must not expose inaccessible dataset links')

for (const [name, route] of [['Catalog','/catalog'],['Profiling','/profiling/explorer'],['Issues','/issues']]) {
  assert.ok(contracts.includes("canAccessWorkspaceHref(landing.persona,'" + route + "'"), 'Contracts ' + name + ' navigation must derive from workspace policy')
}
assert.ok(contracts.includes('canCatalog?<Link href="/catalog"'), 'Contracts Catalog CTA must fail closed')
assert.ok(contracts.includes('canProfiling?<Link href="/profiling/explorer"'), 'Contracts profiling CTA must fail closed')
assert.ok(contracts.includes('canIssues?<Link href="/issues"'), 'Contracts Issues CTA must fail closed')

console.log('Wave 6 local navigation policy contract passed.')
