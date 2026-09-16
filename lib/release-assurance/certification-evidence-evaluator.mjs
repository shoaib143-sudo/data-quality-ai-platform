const allowedResults = new Set(['PASS', 'FAIL', 'NOT_MEASURED', 'NOT_APPLICABLE', 'WAIVED'])

function parseTimestamp(value) {
  const ms = Date.parse(String(value ?? ''))
  return Number.isFinite(ms) ? ms : null
}

function maxAgeSeconds(record) {
  const policy = record?.freshnessPolicy
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null
  const value = Number(policy.maxAgeSeconds)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function evaluateCertificationEvidence({ contract, evidence, claimLevel, sourceCommit, now = new Date() }) {
  const failures = []
  if (!contract || typeof contract !== 'object') return { eligible: false, failures: ['Certification contract is required.'], classes: {} }
  if (!['CERTIFIED', 'PRODUCTION_VERIFIED'].includes(claimLevel)) {
    return { eligible: false, failures: [`Unsupported certification claim level ${claimLevel}.`], classes: {} }
  }
  if (!sourceCommit || typeof sourceCommit !== 'string') failures.push('Exact source commit is required.')
  const nowMs = now instanceof Date ? now.getTime() : parseTimestamp(now)
  if (!Number.isFinite(nowMs)) failures.push('Evaluation time is invalid.')

  const records = Array.isArray(evidence) ? evidence : []
  const requiredClasses = (contract.mandatoryEvidenceClasses ?? []).filter(item => item?.requiredFor?.includes(claimLevel))
  const requiredIds = new Set(requiredClasses.map(item => item.id))
  const grouped = new Map()
  for (const record of records) {
    const id = String(record?.evidenceClass ?? '')
    if (!grouped.has(id)) grouped.set(id, [])
    grouped.get(id).push(record)
  }

  const classes = {}
  for (const definition of requiredClasses) {
    const id = definition.id
    const candidates = grouped.get(id) ?? []
    if (candidates.length !== 1) {
      failures.push(candidates.length === 0
        ? `Required evidence class ${id} is missing.`
        : `Required evidence class ${id} has ${candidates.length} records; exactly one authoritative record is required.`)
      classes[id] = { eligible: false, reason: candidates.length === 0 ? 'MISSING' : 'DUPLICATE' }
      continue
    }

    const record = candidates[0]
    const missingFields = (contract.requiredEvidenceRecordFields ?? []).filter(field => {
      const value = record?.[field]
      return value === undefined || value === null || value === ''
    })
    if (missingFields.length) failures.push(`${id} evidence is missing required fields: ${missingFields.join(', ')}.`)

    const result = String(record.result ?? '')
    if (!allowedResults.has(result)) failures.push(`${id} evidence has invalid result ${result || '(missing)'}.`)
    if (!['PASS', 'NOT_APPLICABLE'].includes(result)) failures.push(`${id} evidence result ${result || '(missing)'} cannot satisfy ${claimLevel}.`)
    if (result === 'NOT_APPLICABLE' && !String(record.rationale ?? '').trim()) {
      failures.push(`${id} NOT_APPLICABLE evidence requires an explicit rationale.`)
    }
    if (String(record.sourceCommit ?? '') !== sourceCommit) failures.push(`${id} evidence is not bound to exact source commit ${sourceCommit}.`)

    const observedAt = parseTimestamp(record.observedAt)
    const maxAge = maxAgeSeconds(record)
    if (observedAt === null) failures.push(`${id} evidence observedAt is invalid.`)
    if (maxAge === null) failures.push(`${id} evidence freshnessPolicy.maxAgeSeconds is required and must be non-negative.`)
    if (observedAt !== null && maxAge !== null && Number.isFinite(nowMs)) {
      if (observedAt > nowMs) failures.push(`${id} evidence observedAt cannot be in the future.`)
      if (nowMs - observedAt > maxAge * 1000) failures.push(`${id} evidence is stale.`)
    }
    if (!String(record.producer ?? '').trim()) failures.push(`${id} evidence producer is required.`)
    if (!String(record.evidenceRef ?? '').trim()) failures.push(`${id} evidenceRef is required.`)
    if (!String(record.environment ?? '').trim()) failures.push(`${id} evidence environment is required.`)

    classes[id] = {
      eligible: !failures.some(message => message.startsWith(`${id} `)),
      result,
      evidenceRef: record.evidenceRef ?? null,
    }
  }

  for (const [id] of grouped) {
    if (id && !requiredIds.has(id) && !(contract.mandatoryEvidenceClasses ?? []).some(item => item.id === id)) {
      failures.push(`Evidence record references unknown class ${id}.`)
    }
  }

  return { eligible: failures.length === 0, failures, classes }
}
