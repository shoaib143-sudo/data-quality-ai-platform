import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const contract = JSON.parse(fs.readFileSync('infra/accessibility/wcag22-aa-persona-contract.json','utf8'))
const evaluator = fs.readFileSync('lib/accessibility/persona-accessibility.ts','utf8')
const persona = fs.readFileSync('lib/governance/personas.ts','utf8')

test('Data Steward is explicitly in the governed WCAG 2.2 AA persona scope', () => {
  assert.equal(contract.target, 'WCAG_2_2_AA')
  assert.ok(contract.personas.includes('data-steward'))
  assert.equal(contract.productionClaimRequiresMeasuredEvidence, true)
  assert.equal(contract.automatedScanAloneIsSufficient, false)
})

test('Data Steward certification requires both automated and manual accessibility evidence', () => {
  for (const check of [
    'KEYBOARD_ONLY','SCREEN_READER','FOCUS_ORDER','ZOOM_200','ZOOM_400',
    'NARROW_VIEWPORT','DYNAMIC_STATUS_ANNOUNCEMENT','FORM_ERROR_RECOVERY',
  ]) assert.ok(contract.requiredManualChecks.includes(check), check)

  for (const marker of ['MANUAL_','AUTOMATED_','EVIDENCE_STALE','NO_REQUIRED_SURFACE_INVENTORY']) {
    assert.ok(evaluator.includes(marker), marker)
  }
})

test('Data Steward remains a first-class persona rather than an accessibility alias', () => {
  assert.match(persona, /'data-steward'/)
  assert.match(persona, /Data Steward/)
})
