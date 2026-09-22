import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dataset360 = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')
const catalog = fs.readFileSync('app/catalog/catalog-manager.tsx', 'utf8')
const lineagePage = fs.readFileSync('app/lineage/page.tsx', 'utf8')
const lineageExplorer = fs.readFileSync('app/lineage/lineage-explorer.tsx', 'utf8')
const roleLanding = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')

test('Dataset 360 keeps connected governance dimensions visible', () => {
  for (const required of [
    'Data 360 context',
    'Lineage',
    'Data contracts',
    'Open observability alerts',
    'Agent activity',
    'Ownership',
    'Business meaning',
    'Classification & CDE',
    'Remediation',
  ]) assert.match(dataset360, new RegExp(required.replace(/[.*+?^$\\{}()|[\]\\]/g, '\\$&')))
})

test('catalog exposes direct Data 360 and lineage paths', () => {
  assert.match(catalog, /Open Data 360/)
  assert.match(catalog, /\/lineage\?q=/)
  assert.match(catalog, /Lineage \{context\.lineageAssets\}/)
  assert.match(catalog, /Contracts \{context\.dataContracts\}/)
  assert.match(catalog, /Alerts \{context\.openAlerts\}/)
})

test('lineage accepts preserved dataset search context', () => {
  assert.match(lineagePage, /searchParams:Promise<\{q\?:string\}>/)
  assert.match(lineagePage, /initialQuery=\(requested\.q\?\?''\)/)
  assert.match(lineageExplorer, /initialQuery\?:string/)
  assert.match(lineageExplorer, /useState\(initialQuery\)/)
})

test('AI Agents remains discoverable from persona navigation', () => {
  assert.match(roleLanding, /label: 'AI Agents', href: '\/agents'/)
  assert.match(roleLanding, /canAccessWorkspaceHref\(persona\.slug, '\/agents'/)
})
