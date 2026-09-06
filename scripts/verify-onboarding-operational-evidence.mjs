import fs from 'node:fs'

const page = fs.readFileSync('app/datasets/page.tsx', 'utf8')
const sourceForm = fs.readFileSync('app/datasets/jdbc-source-form.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Onboarding operational evidence contract missing: ${label}`)
}

requireText(page, "from('source_operational_readiness')", 'onboarding consumes governed readiness projection')
requireText(page, 'Lifecycle is configuration authority.', 'lifecycle authority remains explicit')
requireText(page, 'Operational state below comes only from governed discovery evidence', 'observation boundary is explicit')
requireText(page, 'Lifecycle:', 'connection card shows lifecycle separately')
requireText(page, 'Operational:', 'connection card shows operational evidence separately')
requireText(page, "operationalState === 'OBSERVED_READY'", 'observed ready is evidence based')
requireText(page, 'ACTIVE` is not treated as proof that discovery has observed the source.', 'active lifecycle is not observational proof')
requireText(page, 'Profiling executable means an available dataset version has an active execution binding to an active configured source.', 'profiling readiness has separate execution meaning')
requireText(page, "source?.status === 'ACTIVE'", 'profiling execution still checks configured lifecycle')
requireText(sourceForm, 'Save connection & governed scope', 'database onboarding saves configuration before observation')
requireText(sourceForm, 'Open Catalog Discovery', 'database onboarding points to discovery for observed physical facts')

const forbidden = [
  /function\s+isReady\s*\([^)]*\)\s*\{[\s\S]*?===\s*['"]ACTIVE['"]/,
  /function\s+sourceLifecycleLabel\s*\([^)]*\)\s*\{\s*return\s+isReady\s*\([^)]*\)\s*\?\s*['"]READY['"]/,
  /operational connection/,
  /One simple state model/,
]
for (const pattern of forbidden) {
  if (pattern.test(page)) throw new Error(`Onboarding still conflates configuration with operational evidence: ${pattern}`)
}

console.log('Onboarding operational evidence boundary verified.')
