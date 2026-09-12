import fs from 'node:fs'

const contract=JSON.parse(fs.readFileSync('infra/accessibility/wcag22-aa-persona-contract.json','utf8'))
const evaluator=fs.readFileSync('lib/accessibility/persona-accessibility.ts','utf8')

if(contract.schemaVersion!==2) throw new Error('Accessibility contract must remain versioned')
if(contract.target!=='WCAG_2_2_AA') throw new Error('Accessibility target must remain WCAG 2.2 AA')
if(contract.claimScope!=='EXPLICIT_REQUIRED_PERSONA_SURFACE_SET') throw new Error('Accessibility claims must remain bound to an explicit persona-surface set')
if(contract.wholePlatformClaimRequiresCompleteSurfaceInventory!==true) throw new Error('Whole-platform WCAG claims require a complete governed surface inventory')
if(contract.productionClaimRequiresMeasuredEvidence!==true) throw new Error('Production accessibility claims must require measured evidence')
if(contract.automatedScanAloneIsSufficient!==false) throw new Error('Automated scan alone must never satisfy accessibility certification')
if(contract.maxEvidenceAgeHours!==24) throw new Error('Accessibility evidence must remain freshness-bound to 24 hours')
if(contract.personas.length!==13) throw new Error(`Expected 13 personas, found ${contract.personas.length}`)
for(const persona of ['senior-leadership','business-user','data-owner','data-product-owner','data-steward','data-governance-specialist','compliance-risk-officer','privacy-security-officer','data-governance-admin','data-custodian','source-system-owner','metadata-analyst','data-quality-analyst']) if(!contract.personas.includes(persona)) throw new Error(`Missing persona ${persona}`)
for(const check of ['KEYBOARD_ONLY','SCREEN_READER','FOCUS_ORDER','DIALOG_FOCUS_TRAP','ZOOM_200','ZOOM_400','NARROW_VIEWPORT','DYNAMIC_STATUS_ANNOUNCEMENT','FORM_ERROR_RECOVERY','COMPLEX_TABLE_OR_GRAPH_ALTERNATIVE']) if(!contract.requiredManualChecks.includes(check)) throw new Error(`Missing manual accessibility check ${check}`)
for(const marker of ['NO_ACCESSIBILITY_EVIDENCE','NO_REQUIRED_SURFACE_INVENTORY','COVERAGE_NOT_DECLARED','surfaceId','productionRepresentative','EVIDENCE_STALE','TIMESTAMP_FUTURE','MANUAL_','AUTOMATED_','HAS_FAILURES','ACCESSIBILITY_MAX_EVIDENCE_AGE_MS']) if(!evaluator.includes(marker)) throw new Error(`Accessibility evaluator missing fail-closed marker ${marker}`)
console.log('WCAG 2.2 AA persona acceptance contract verified: explicit persona-surface scope, 13 personas, fresh manual + automated evidence, production-measured claims only.')
