import fs from 'node:fs'
import assert from 'node:assert/strict'

const reader = fs.readFileSync('lib/governance/governed-incident-reader.ts', 'utf8')
const normalization = fs.readFileSync('lib/governance/incident-evidence-normalization.ts', 'utf8')

assert.ok(normalization.includes('text(source.cause)'), 'Structured root-cause payloads must preserve the canonical `cause` field.')
assert.ok(normalization.includes('text(source.summary)'), 'Summary-form root causes must remain supported.')
assert.ok(normalization.includes('text(source.description)'), 'Description-form root causes must remain supported.')
assert.ok(normalization.includes('text(source.rationale)'), 'Rationale-form root causes must remain supported.')
assert.ok(normalization.includes('parsed >= 0 && parsed <= 1'), 'Root-cause confidence must remain bounded to governed probability semantics.')
assert.ok(normalization.includes('resolveLegacyVerificationProfileRunId'), 'Historical verification profile linkage must have a deterministic resolver.')

assert.ok(reader.includes('normalizeRootCauseEvidence(investigation?.probable_root_causes)'), 'DQ investigation RCA must use structured evidence normalization.')
assert.ok(reader.includes('normalizeRootCauseEvidence(observability?.probable_root_causes)'), 'Observability RCA must use structured evidence normalization.')
assert.ok(reader.includes('confidence: cause.confidence'), 'DQ RCA must retain per-cause confidence when present.')
assert.ok(reader.includes('confidence: cause.confidence ?? observability!.confidence ?? null'), 'Observability RCA must prefer per-cause confidence and only then incident confidence.')
assert.ok(reader.includes('advisory: true'), 'Probabilistic RCA must remain advisory rather than governance truth.')
assert.ok(reader.includes('resolveLegacyVerificationProfileRunId(dq.verification_profile_run_id, dq.outcome)'), 'Canonical incident reader must resolve legacy profile provenance defensively.')
assert.ok(!reader.includes('function stringList('), 'Reader must not regress to a string-only probable-root-cause parser.')

console.log('Canonical incident evidence normalization verifier passed.')
