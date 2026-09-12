import { readFile } from 'node:fs/promises'

const engine = await readFile('lib/governance/persona-presentation.ts', 'utf8')
const viewRegistry = await readFile('lib/governance/persona-presentation-view.ts', 'utf8')
const landing = await readFile('components/governance/role-landing-page.tsx', 'utf8')
const personas = await readFile('lib/governance/personas.ts', 'utf8')
const architecture = await readFile('Architecture/2026-09-12-persona-aware-presentation-engine.md', 'utf8')

const personaSlugs = [
  'senior-leadership',
  'business-user',
  'data-owner',
  'data-product-owner',
  'data-steward',
  'data-governance-specialist',
  'compliance-risk-officer',
  'privacy-security-officer',
  'data-governance-admin',
  'data-custodian',
  'source-system-owner',
  'metadata-analyst',
  'data-quality-analyst',
]

for (const slug of personaSlugs) {
  if (!personas.includes(`'${slug}'`)) throw new Error(`Canonical persona registry missing ${slug}`)
  if (!engine.includes(`'${slug}':`)) throw new Error(`Presentation engine missing policy for ${slug}`)
  console.log(`PASS presentation policy ${slug}`)
}

for (const [pattern, label] of [
  [/GOVERNED_OUTCOME_ONLY/, 'governed outcome truth boundary'],
  [/EXTERNAL_TO_PRESENTATION_ENGINE/, 'authorization boundary'],
  [/CANONICAL_PERSONA_VIEW/, 'safe canonical fallback'],
  [/Record<PersonaSlug, PersonaPresentationPolicy>/, 'compile-time persona policy exhaustiveness'],
  [/buildPersonaPresentationPlan/, 'explicit presentation-plan builder'],
  [/suppression|suppress/i, 'persona default suppression policy'],
]) {
  if (!pattern.test(engine)) throw new Error(`Persona presentation engine missing ${label}`)
  console.log(`PASS ${label}`)
}

for (const primitive of [
  'executive-health', 'trusted-data-discovery', 'decision-queue', 'product-trust',
  'steward-work-queue', 'governance-programme', 'control-assurance', 'privacy-exposure',
  'platform-operations', 'technical-remediation', 'source-impact', 'metadata-intelligence',
  'quality-diagnostics',
]) {
  if (!viewRegistry.includes(`case '${primitive}'`)) throw new Error(`Governed view registry missing renderer for ${primitive}`)
  console.log(`PASS governed renderer ${primitive}`)
}

for (const [pattern, label] of [
  [/buildPersonaPresentationPlan\(persona\.slug\)/, 'landing consumes central presentation plan'],
  [/buildRoleLandingPresentation\(plan, data\)/, 'landing consumes governed view registry'],
  [/canAccessWorkspaceHref/, 'authorization remains outside presentation engine'],
  [/id="main-content"/, 'accessible main-content target'],
  [/Presentation changes by persona; governed evidence does not\./, 'visible truth-boundary copy'],
]) {
  if (!pattern.test(landing)) throw new Error(`Role landing integration missing ${label}`)
  console.log(`PASS ${label}`)
}

if (/function personaView\(/.test(landing)) throw new Error('Role landing must not retain a second hard-coded persona presentation engine.')
console.log('PASS duplicate hard-coded persona view engine removed')

for (const [pattern, label] of [
  [/will not create a separate UI\/UX Governance Agent/, 'no separate UI agent decision'],
  [/deterministic-first/i, 'deterministic-first architecture'],
  [/must never manufacture/i, 'frontend governance truth boundary'],
  [/thirteen-persona/i, 'canonical thirteen-persona baseline'],
]) {
  if (!pattern.test(architecture)) throw new Error(`Presentation architecture missing ${label}`)
  console.log(`PASS ${label}`)
}

console.log('DataNexus Persona-Aware Presentation Engine verification completed.')
