import assert from 'node:assert/strict'
const { evaluatePersonaAccessibility, ACCESSIBILITY_PERSONAS, REQUIRED_AUTOMATED_CHECKS, REQUIRED_MANUAL_CHECKS } = await import('../lib/accessibility/persona-accessibility.ts')

const now=Date.parse('2026-09-12T12:00:00Z')
assert.deepEqual(evaluatePersonaAccessibility([],[],now), { state: 'NOT_MEASURED', blockers: ['NO_ACCESSIBILITY_EVIDENCE'] })
assert.deepEqual(evaluatePersonaAccessibility([{persona:'business-user',surfaceId:'issues',route:'/issues',observedAt:'2026-09-12T11:00:00Z',productionRepresentative:true,automatedPassed:[],manualPassed:[],failures:[]}],[],now), { state: 'NOT_MEASURED', blockers: ['NO_REQUIRED_SURFACE_INVENTORY'] })

const coverage=ACCESSIBILITY_PERSONAS.map((persona)=>({persona,surfaceId:'incident-workspace'}))
const evidence=ACCESSIBILITY_PERSONAS.map((persona)=>({
  persona,
  surfaceId:'incident-workspace',
  route:'/issues',
  observedAt:'2026-09-12T11:00:00Z',
  productionRepresentative:true,
  automatedPassed:[...REQUIRED_AUTOMATED_CHECKS],
  manualPassed:[...REQUIRED_MANUAL_CHECKS],
  failures:[]
}))
assert.equal(evaluatePersonaAccessibility(evidence,coverage,now).state,'PASS')

const missingPersonaCoverage=coverage.filter((row)=>row.persona!=='metadata-analyst')
assert(evaluatePersonaAccessibility(evidence,missingPersonaCoverage,now).blockers.includes('PERSONA_metadata-analyst_COVERAGE_NOT_DECLARED'))

const previewOnly=evidence.map((row)=>({...row,productionRepresentative:false}))
assert.equal(evaluatePersonaAccessibility(previewOnly,coverage,now).state,'FAIL')
assert(evaluatePersonaAccessibility(previewOnly,coverage,now).blockers.includes('PERSONA_business-user_SURFACE_incident-workspace_NOT_MEASURED'))

const noKeyboard=evidence.map((row)=>row.persona==='data-steward'?{...row,manualPassed:row.manualPassed.filter((x)=>x!=='KEYBOARD_ONLY')}:row)
assert(evaluatePersonaAccessibility(noKeyboard,coverage,now).blockers.includes('PERSONA_data-steward_SURFACE_incident-workspace_MANUAL_KEYBOARD_ONLY_MISSING'))

const noContrast=evidence.map((row)=>row.persona==='business-user'?{...row,automatedPassed:row.automatedPassed.filter((x)=>x!=='COLOR_CONTRAST')}:row)
assert(evaluatePersonaAccessibility(noContrast,coverage,now).blockers.includes('PERSONA_business-user_SURFACE_incident-workspace_AUTOMATED_COLOR_CONTRAST_MISSING'))

const explicitFailure=evidence.map((row)=>row.persona==='senior-leadership'?{...row,failures:['focus lost after dialog close']}:row)
assert(evaluatePersonaAccessibility(explicitFailure,coverage,now).blockers.includes('PERSONA_senior-leadership_SURFACE_incident-workspace_HAS_FAILURES'))

const stale=evidence.map((row)=>({...row,observedAt:'2026-09-10T00:00:00Z'}))
assert(evaluatePersonaAccessibility(stale,coverage,now).blockers.includes('PERSONA_business-user_SURFACE_incident-workspace_EVIDENCE_STALE'))

const future=evidence.map((row)=>({...row,observedAt:'2026-09-12T12:10:01Z'}))
assert(evaluatePersonaAccessibility(future,coverage,now).blockers.includes('PERSONA_business-user_SURFACE_incident-workspace_TIMESTAMP_FUTURE'))

const wrongSurface=evidence.map((row)=>row.persona==='data-owner'?{...row,surfaceId:'other-surface'}:row)
assert(evaluatePersonaAccessibility(wrongSurface,coverage,now).blockers.includes('PERSONA_data-owner_SURFACE_incident-workspace_NOT_MEASURED'))

console.log('Persona accessibility negative/failure tests passed.')
