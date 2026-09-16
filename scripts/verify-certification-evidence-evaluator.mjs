import fs from 'node:fs'
import { evaluateCertificationEvidence } from '../lib/release-assurance/certification-evidence-evaluator.mjs'

const contract = JSON.parse(fs.readFileSync('infra/platform-assurance/post-implementation-certification-contract.json', 'utf8'))
const sourceCommit = 'self-check'
const now = new Date('2026-09-16T08:00:00.000Z')
const evidence = contract.mandatoryEvidenceClasses
  .filter(item => item.requiredFor.includes('CERTIFIED'))
  .map(item => ({
    evidenceClass: item.id,
    result: 'PASS',
    sourceCommit,
    environment: 'self-check',
    observedAt: '2026-09-16T07:59:00.000Z',
    producer: `self-check-${item.id}`,
    evidenceRef: `self-check://${item.id}`,
    freshnessPolicy: { maxAgeSeconds: 3600 },
  }))
const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
if (!result.eligible) throw new Error(result.failures.join('\n'))
console.log(`Certification evidence evaluator self-check passed for ${Object.keys(result.classes).length} required classes.`)
