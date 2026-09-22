import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/search/page.tsx','utf8')
for(const marker of ['Search once. Follow governed evidence anywhere.','Access-aware results','Search across governed evidence','GlobalSearch','Catalog']) assert.ok(source.includes(marker), `search UX marker missing: ${marker}`)
assert.ok(source.includes("canAccessWorkspaceHref(landing.persona,'/catalog'"), 'Catalog transition must remain href-policy gated')
assert.ok(source.includes('canCatalog?<div'), 'Catalog action must remain fail closed')
assert.ok(source.includes("bg-[#050b17]"), 'search must use native DataNexus canvas')
assert.ok(source.includes('Search never creates visibility.'), 'search must preserve access-authority truth boundary')
console.log('Global Search UX experience contract passed.')
