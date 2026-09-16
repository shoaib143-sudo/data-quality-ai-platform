import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = process.cwd()
const verifier = path.join(root, 'scripts/verify-post-implementation-certification-contract.mjs')
const sourcePath = path.join(root, 'infra/platform-assurance/post-implementation-certification-contract.json')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

function verify(contract) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-cert-contract-'))
  const candidatePath = path.join(tempDir, 'contract.json')
  fs.writeFileSync(candidatePath, `${JSON.stringify(contract, null, 2)}\n`)
  const result = spawnSync(process.execPath, [verifier], {
    cwd: root,
    env: { ...process.env, DATANEXUS_CERTIFICATION_CONTRACT_PATH: candidatePath },
    encoding: 'utf8',
  })
  fs.rmSync(tempDir, { recursive: true, force: true })
  return result
}

function mutated(mutator) {
  const candidate = structuredClone(source)
  mutator(candidate)
  return candidate
}

test('authoritative post-implementation contract passes its verifier', () => {
  const result = verify(source)
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('NOT_MEASURED can never satisfy required certification evidence', () => {
  const result = verify(mutated(contract => { contract.truthRules.notMeasuredMaySatisfyRequiredEvidence = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /notMeasuredMaySatisfyRequiredEvidence/)
})

test('independent assurance cannot be produced by the implementation producer', () => {
  const result = verify(mutated(contract => { contract.truthRules.independentEvidenceProducerMayEqualImplementationProducer = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /independentEvidenceProducerMayEqualImplementationProducer/)
})

test('recovery cannot substitute for re-executing the original failed step', () => {
  const result = verify(mutated(contract => { contract.truthRules.recoveryMaySubstituteForOriginalStepReexecution = true }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /recoveryMaySubstituteForOriginalStepReexecution/)
})

test('authorization and isolation evidence class is mandatory', () => {
  const result = verify(mutated(contract => {
    contract.mandatoryEvidenceClasses = contract.mandatoryEvidenceClasses.filter(item => item.id !== 'AUTHORIZATION_AND_ISOLATION')
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /AUTHORIZATION_AND_ISOLATION/)
})

test('R3 migration boundary cannot be downgraded', () => {
  const result = verify(mutated(contract => {
    contract.mandatoryEvidenceClasses.find(item => item.id === 'MIGRATION_AND_RECONSTRUCTION').riskTier = 'R2'
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /MIGRATION_AND_RECONSTRUCTION must remain an R3/)
})

test('adversarial acceptance path cannot be removed', () => {
  const result = verify(mutated(contract => {
    contract.requiredAcceptancePaths = contract.requiredAcceptancePaths.filter(item => item !== 'UNAUTHORIZED_ADVERSARIAL')
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Three-path acceptance is mandatory/)
})

test('exact-head post-implementation revalidation cannot be disabled', () => {
  const result = verify(mutated(contract => { contract.postImplementationRevalidation.exactHeadAfterFinalChange = false }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /exactHeadAfterFinalChange/)
})

test('concurrency validation cannot be omitted', () => {
  const result = verify(mutated(contract => { delete contract.postImplementationRevalidation.stateTransitionAndConcurrencyTests }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /stateTransitionAndConcurrencyTests/)
})

test('chaos and dependency failure validation cannot be disabled', () => {
  const result = verify(mutated(contract => { contract.postImplementationRevalidation.chaosAndDependencyFailureTests = false }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /chaosAndDependencyFailureTests/)
})

test('compromised-agent audit cannot be disabled', () => {
  const result = verify(mutated(contract => { contract.postImplementationRevalidation.compromisedAgentAndToolMisuseAudit = false }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /compromisedAgentAndToolMisuseAudit/)
})

test('best-practice alignment cannot be misrepresented as external certification', () => {
  const result = verify(mutated(contract => { contract.bestPracticeAlignment.claim = 'CERTIFIED' }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must not be represented as external certification/)
})

test('current OWASP GenAI risk guidance remains an explicit review input', () => {
  const result = verify(mutated(contract => {
    contract.bestPracticeAlignment.references = contract.bestPracticeAlignment.references.filter(item => item !== 'OWASP_GENAI_LLM_TOP_10_2026')
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /OWASP_GENAI_LLM_TOP_10_2026/)
})

test('production source binding cannot be removed', () => {
  const result = verify(mutated(contract => {
    contract.productionVerificationBindings = contract.productionVerificationBindings.filter(item => item !== 'certifiedSourceCommit')
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /certifiedSourceCommit/)
})
