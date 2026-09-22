import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/catalog/page.tsx','utf8')
for(const marker of [
  'Find the right governed data faster.',
  'Governed datasets',
  'Observed versions',
  'Projects editable',
  'Discovery',
  'Browse physical assets',
  'Connect business meaning',
  'CatalogManager',
]) assert.ok(source.includes(marker), `catalog UX marker missing: ${marker}`)

assert.ok(source.includes('canDiscover?<Link href="/catalog/discovery"'), 'discovery task must remain capability gated')
assert.ok(source.includes('canGlossary?<Link href="/glossary"'), 'glossary task must remain persona gated')
assert.ok(source.includes('initialQuery=(params.q??\'\').trim().slice(0,120)'), 'catalog query input must remain length bounded')
assert.ok(source.includes('editableProjectIds.length'), 'catalog must expose edit-authority context without broadening authority')
assert.ok(!source.includes('bg-slate-50'), 'catalog header must stay on native DataNexus dark surfaces')

console.log('Data Catalog UX experience contract passed.')
