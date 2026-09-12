import fs from 'node:fs'
import path from 'node:path'

const fail = (message) => { throw new Error(message) }
const register = JSON.parse(fs.readFileSync('infra/platform-assurance/residual-risk-register.json', 'utf8'))
const contract = JSON.parse(fs.readFileSync('infra/platform-assurance/post-implementation-certification-contract.json', 'utf8'))

if (register.schemaVersion !== 1) fail('Residual-risk register schemaVersion must be 1.')
if (register.authority !== 'infra/platform-assurance/post-implementation-certification-contract.json') fail('Residual-risk register must bind to the post-implementation certification contract.')
if (register.reviewPolicy?.reviewOnMaterialChange !== true) fail('Residual risks must be re-reviewed on material change.')
if (register.reviewPolicy?.expiredReviewBlocksCertification !== true) fail('Expired residual-risk reviews must block certification.')
const maxReviewDays = register.reviewPolicy?.defaultMaximumReviewDays
if (!Number.isInteger(maxReviewDays) || maxReviewDays < 1 || maxReviewDays > 30) fail('Residual-risk default review period must be between 1 and 30 days.')

const requiredFields = contract.exceptionRecordRequiredFields ?? []
const risks = register.risks ?? []
if (risks.length === 0) fail('Residual-risk register must not be empty while advisor exceptions or open gaps exist.')
const ids = risks.map(risk => risk.riskId)
if (new Set(ids).size !== ids.length) fail('Residual-risk IDs must be unique.')

const now = Date.now()
for (const risk of risks) {
  for (const field of requiredFields) {
    if (!Object.hasOwn(risk, field)) fail(`Residual risk ${risk.riskId ?? 'unknown'} is missing required field ${field}.`)
  }
  if (!['R0', 'R1', 'R2', 'R3'].includes(risk.riskTier)) fail(`Residual risk ${risk.riskId} has invalid risk tier.`)
  if (!['ACCEPTED_EXCEPTION', 'OPEN_GAP', 'CLOSED'].includes(risk.status)) fail(`Residual risk ${risk.riskId} has invalid status ${risk.status}.`)
  if (typeof risk.owner !== 'string' || risk.owner.trim().length === 0) fail(`Residual risk ${risk.riskId} must have an accountable owner.`)
  if (typeof risk.rationale !== 'string' || risk.rationale.trim().length < 20) fail(`Residual risk ${risk.riskId} must record a substantive rationale.`)
  if (!Array.isArray(risk.compensatingControls) || risk.compensatingControls.length === 0) fail(`Residual risk ${risk.riskId} must record compensating controls.`)
  if (typeof risk.closureCondition !== 'string' || risk.closureCondition.trim().length < 20) fail(`Residual risk ${risk.riskId} must record a concrete closure condition.`)

  const recordedAt = Date.parse(risk.recordedAt)
  const reviewDueAt = Date.parse(risk.reviewDueAt)
  if (!Number.isFinite(recordedAt) || !Number.isFinite(reviewDueAt) || reviewDueAt <= recordedAt) fail(`Residual risk ${risk.riskId} has invalid review dates.`)
  const reviewWindowDays = (reviewDueAt - recordedAt) / 86_400_000
  if (reviewWindowDays > maxReviewDays) fail(`Residual risk ${risk.riskId} exceeds the ${maxReviewDays}-day maximum review window.`)
  if (risk.status !== 'CLOSED' && reviewDueAt <= now) fail(`Residual risk ${risk.riskId} review is expired and blocks certification.`)

  if (!Array.isArray(risk.evidenceRefs) || risk.evidenceRefs.length === 0) fail(`Residual risk ${risk.riskId} must cite evidence.`)
  for (const evidence of risk.evidenceRefs) {
    if (!fs.existsSync(path.resolve(evidence))) fail(`Residual risk ${risk.riskId} evidence path is missing: ${evidence}`)
  }
}

const openR3 = risks.filter(risk => risk.riskTier === 'R3' && risk.status === 'OPEN_GAP')
if (openR3.length > 0) fail(`Open R3 residual risk blocks certification: ${openR3.map(risk => risk.riskId).join(', ')}`)

console.log(`Residual-risk register verified: ${risks.length} risks, ${risks.filter(risk => risk.status === 'OPEN_GAP').length} open gap(s), reviews current through the configured deadlines.`)
