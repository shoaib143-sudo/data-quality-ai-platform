import fs from 'node:fs'

const contractPath = process.env.DATANEXUS_CERTIFICATION_CONTRACT_PATH || 'infra/platform-assurance/post-implementation-certification-contract.json'
const evidencePath = process.env.DATANEXUS_CERTIFICATION_EVIDENCE_PATH || process.argv[2]
if (!evidencePath) throw new Error('Certification evidence manifest path is required.')
if (!fs.existsSync(contractPath)) throw new Error(`Certification contract not found: ${contractPath}`)
if (!fs.existsSync(evidencePath)) throw new Error(`Certification evidence manifest not found: ${evidencePath}`)

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
const fail = message => { throw new Error(message) }

if (manifest.schemaVersion !== 1) fail('Certification evidence manifest schemaVersion must be 1.')
const claimLevel = String(manifest.claimLevel || '')
if (!['CERTIFIED', 'PRODUCTION_VERIFIED'].includes(claimLevel)) fail('Certification evidence claimLevel must be CERTIFIED or PRODUCTION_VERIFIED.')
const sourceCommit = String(manifest.sourceCommit || '').toLowerCase()
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) fail('Certification evidence requires a full sourceCommit.')
const expectedCommit = String(process.env.GITHUB_SHA || process.env.DATANEXUS_SOURCE_COMMIT || '').trim().toLowerCase()
if (expectedCommit && sourceCommit !== expectedCommit) fail(`Certification source commit ${sourceCommit} does not match exact evaluated head ${expectedCommit}.`)

const implementationProducer = String(manifest.implementationProducer || '').trim()
const independentProducer = String(manifest.independentAssuranceProducer || '').trim()
if (!implementationProducer || !independentProducer) fail('Implementation and independent assurance producer identities are required.')
if (implementationProducer === independentProducer) fail('Independent assurance producer must differ from the implementation producer.')

if (!Array.isArray(manifest.acceptancePaths)) fail('Certification acceptancePaths must be an array.')
const acceptance = new Map()
const knownAcceptancePaths = new Set(contract.requiredAcceptancePaths || [])
for (const item of manifest.acceptancePaths) {
  const pathName = String(item?.path || '')
  if (!knownAcceptancePaths.has(pathName)) fail(`Unknown acceptance path ${pathName || '<missing>'}.`)
  if (acceptance.has(pathName)) fail(`Duplicate acceptance path ${pathName} is ambiguous.`)
  acceptance.set(pathName, item)
}
for (const requiredPath of contract.requiredAcceptancePaths || []) {
  const item = acceptance.get(requiredPath)
  if (!item) fail(`Missing required acceptance path ${requiredPath}.`)
  if (item.result !== 'PASS') fail(`Acceptance path ${requiredPath} must be PASS.`)
  if (typeof item.evidenceRef !== 'string' || !item.evidenceRef.trim()) fail(`Acceptance path ${requiredPath} requires evidenceRef.`)
}

const now = Date.now()
const allowedFutureSkewMs = 5 * 60 * 1000
if (!Array.isArray(manifest.evidenceRecords)) fail('Certification evidenceRecords must be an array.')
const records = manifest.evidenceRecords
const recordsByClass = new Map()
const knownEvidenceClasses = new Set((contract.mandatoryEvidenceClasses || []).map(item => item.id))
for (const record of records) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('Certification evidence record must be an object.')
  for (const field of contract.requiredEvidenceRecordFields || []) {
    if (!(field in record)) fail(`Certification evidence record for ${record.evidenceClass || '<unknown>'} is missing ${field}.`)
  }
  if (!knownEvidenceClasses.has(record.evidenceClass)) fail(`Unknown certification evidence class ${record.evidenceClass || '<missing>'}.`)
  if (!contract.resultStates.includes(record.result)) fail(`Evidence class ${record.evidenceClass} has invalid result ${record.result}.`)
  if (String(record.sourceCommit || '').toLowerCase() !== sourceCommit) fail(`Evidence class ${record.evidenceClass} is bound to a different source commit.`)
  if (typeof record.environment !== 'string' || !record.environment.trim()) fail(`Evidence class ${record.evidenceClass} requires environment.`)
  if (typeof record.producer !== 'string' || !record.producer.trim()) fail(`Evidence class ${record.evidenceClass} requires producer.`)
  if (typeof record.evidenceRef !== 'string' || !record.evidenceRef.trim()) fail(`Evidence class ${record.evidenceClass} requires evidenceRef.`)
  const observedAt = Date.parse(String(record.observedAt || ''))
  if (!Number.isFinite(observedAt)) fail(`Evidence class ${record.evidenceClass} has invalid observedAt.`)
  if (observedAt > now + allowedFutureSkewMs) fail(`Evidence class ${record.evidenceClass} is future-dated.`)
  const maxAgeSeconds = Number(record.freshnessPolicy?.maxAgeSeconds)
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) fail(`Evidence class ${record.evidenceClass} requires positive freshnessPolicy.maxAgeSeconds.`)
  if (now - observedAt > maxAgeSeconds * 1000) fail(`Evidence class ${record.evidenceClass} is stale.`)
  const list = recordsByClass.get(record.evidenceClass) || []
  list.push(record)
  recordsByClass.set(record.evidenceClass, list)
}

const requiredClasses = (contract.mandatoryEvidenceClasses || []).filter(item =>
  item.requiredFor?.includes('CERTIFIED') || (claimLevel === 'PRODUCTION_VERIFIED' && item.requiredFor?.includes('PRODUCTION_VERIFIED')),
)
for (const evidenceClass of requiredClasses) {
  const classRecords = recordsByClass.get(evidenceClass.id) || []
  if (classRecords.length === 0) fail(`Missing required evidence class ${evidenceClass.id}.`)
  if (classRecords.length !== 1) fail(`Required evidence class ${evidenceClass.id} must have exactly one authoritative record; found ${classRecords.length}.`)
  const satisfying = classRecords[0]
  if (['FAIL', 'NOT_MEASURED', 'WAIVED'].includes(satisfying.result)) {
    fail(`Required evidence class ${evidenceClass.id} contains a non-certifying result.`)
  }
  if (!['PASS', 'NOT_APPLICABLE'].includes(satisfying.result)) fail(`Required evidence class ${evidenceClass.id} has no satisfying result.`)
  if (satisfying.result === 'NOT_APPLICABLE' && (typeof satisfying.notApplicableJustification !== 'string' || satisfying.notApplicableJustification.trim().length < 20)) {
    fail(`NOT_APPLICABLE evidence class ${evidenceClass.id} requires a concrete justification.`)
  }
  if (claimLevel === 'PRODUCTION_VERIFIED' && evidenceClass.requiredFor?.includes('PRODUCTION_VERIFIED') && satisfying.result === 'PASS') {
    if (String(satisfying.environment).toUpperCase() !== 'PRODUCTION') fail(`Production evidence class ${evidenceClass.id} must come from the PRODUCTION environment.`)
  }
}

const requiredRevalidationKeys = Object.entries(contract.postImplementationRevalidation || {})
  .filter(([, required]) => required === true)
  .map(([key]) => key)
if (!Array.isArray(manifest.revalidation)) fail('Certification revalidation must be an array.')
const knownRevalidationGates = new Set(requiredRevalidationKeys)
const revalidation = new Map()
for (const item of manifest.revalidation) {
  const gate = String(item?.gate || '')
  if (!knownRevalidationGates.has(gate)) fail(`Unknown post-implementation revalidation gate ${gate || '<missing>'}.`)
  if (revalidation.has(gate)) fail(`Duplicate post-implementation revalidation gate ${gate} is ambiguous.`)
  revalidation.set(gate, item)
}
for (const gate of requiredRevalidationKeys) {
  const item = revalidation.get(gate)
  if (!item) fail(`Missing post-implementation revalidation gate ${gate}.`)
  if (!['PASS', 'NOT_APPLICABLE'].includes(item.result)) fail(`Revalidation gate ${gate} must be PASS or justified NOT_APPLICABLE.`)
  if (typeof item.evidenceRef !== 'string' || !item.evidenceRef.trim()) fail(`Revalidation gate ${gate} requires evidenceRef.`)
  if (item.result === 'NOT_APPLICABLE' && (typeof item.justification !== 'string' || item.justification.trim().length < 20)) {
    fail(`NOT_APPLICABLE revalidation gate ${gate} requires a concrete justification.`)
  }
  if (claimLevel === 'PRODUCTION_VERIFIED' && gate === 'productionValidationWhenApplicable' && item.result !== 'PASS') {
    fail('PRODUCTION_VERIFIED requires productionValidationWhenApplicable to PASS.')
  }
}

if (claimLevel === 'PRODUCTION_VERIFIED') {
  const bindings = manifest.productionBindings || {}
  for (const binding of contract.productionVerificationBindings || []) {
    if (typeof bindings[binding] !== 'string' || !bindings[binding].trim()) fail(`PRODUCTION_VERIFIED requires production binding ${binding}.`)
  }
  if (String(bindings.certifiedSourceCommit).toLowerCase() !== sourceCommit) fail('Production certifiedSourceCommit does not match the evaluated source commit.')
}

const decision = {
  schemaVersion: 1,
  claimLevel,
  result: 'PASS',
  sourceCommit,
  evaluatedAt: new Date().toISOString(),
  requiredEvidenceClassCount: requiredClasses.length,
  requiredRevalidationGateCount: requiredRevalidationKeys.length,
  acceptancePaths: [...acceptance.keys()],
  independentAssuranceProducer: independentProducer,
}
console.log(JSON.stringify(decision, null, 2))
