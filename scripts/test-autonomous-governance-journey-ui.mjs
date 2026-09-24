import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const consoleUi = readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const coach = readFileSync('app/agents/autonomous-governance/autonomous-run-coach.tsx', 'utf8')
const journey = readFileSync('lib/orchestration/governance-autonomous-journey.ts', 'utf8')
const runtime = readFileSync('lib/orchestration/governance-orchestrator-service-v2.ts', 'utf8')

test('both autonomous modes have seven actual phase labels, not static placeholders', () => {
  for (const mode of ['GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
    assert.ok(coach.includes(mode), mode)
  }
  assert.match(coach, /\{label\} governance E2E/)
  for (const phase of ['Select project', 'Review policy', 'Set autonomy bounds', 'Define objective',
    'Submit run', 'Human oversight', 'Monitor agents', 'Review evidence', 'Independent certification']) {
    assert.ok(coach.includes(phase), phase)
  }
  assert.match(consoleUi, /nextAutonomousInstruction\(\{/)
  assert.match(consoleUi, /<AutonomousRunCoach/)
  assert.match(consoleUi, /mode=\{autonomousMode\}/)
  assert.match(coach, /instruction\.stepNumber/)
  assert.match(coach, /aria-current=\{current && !instruction\.isTerminal \? 'step'/)
  assert.match(coach, /role="status" aria-live="polite"/)
  assert.match(coach, /href=\{instruction\.target\}/)
})

test('persisted policy and real run evidence are required to advance the operator guide', () => {
  for (const guard of ['input.persistedMode !== input.mode', 'input.persistedEnabled',
    'input.persistedEmergencyStop', 'input.hasUnsavedPolicyEdits', 'input.canExecute',
    'input.runMode === input.mode', "input.runStatus === 'WAITING_APPROVAL'",
    "input.runStatus !== 'SUCCEEDED'", 'input.executedCount !== 75',
    'input.verifiedCount !== 75', '!input.certificationEligible', "input.assessmentState !== 'PASS'"]) {
    assert.ok(journey.includes(guard), guard)
  }
  assert.match(consoleUi, /summaryRow\.certificationEligible === true/)
  assert.match(consoleUi, /coverage\?\.mode === persistedPolicy\?\.mode/)
  assert.match(consoleUi, /!hasUnsavedPolicyEdits/)
  assert.match(coach, /Executed: \{executedCount\}\/75/)
  assert.match(coach, /Independently verified: \{verifiedCount\}\/75/)
})

test('non-GUIDED scope warnings reflect current backend, with deliberate UI confirmation', () => {
  assert.match(runtime, /: await attachLatestDatasetVersions\(input\.projectId, capabilityRunId, guidedScope\)/)
  assert.match(coach, /project dataset versions when present/)
  assert.match(coach, /does not provide dataset-specific isolation/)
  assert.match(consoleUi, /autoProjectScopeAcknowledged/)
  assert.match(consoleUi, /!autoProjectScopeAcknowledged/)
  assert.match(consoleUi, /setAutoProjectScopeAcknowledged\(false\)/)
  assert.match(consoleUi, /function chooseMode\(mode: Policy\['mode'\]\) \{\n    setGoal\(''\)/)
  assert.match(consoleUi, /setGuidedSourceId\(''\)\n    setGoal\(''\)/)
  assert.match(consoleUi, /checked=\{autoProjectScopeAcknowledged\}/)
  assert.match(consoleUi, /current \{autonomousMode\} dispatch attaches the latest project datasets/)
  assert.match(consoleUi, /setMessage\('Confirm the current project-wide dataset attachment behavior/)
  assert.doesNotMatch(coach, /onClick=\{.*approve|onClick=\{.*certif/i)
})

test('no automatic budget changes, stop clearing or fabricated evidence in either coach', () => {
  assert.match(coach, /policy\?\.maxExecutionBudget/)
  assert.match(coach, /policy\?\.maxModelBudget/)
  assert.match(coach, /policy\?\.emergencyStop/)
  assert.match(coach, /policy\?\.autoRemediationEnabled/)
  assert.match(coach, /policy\?\.autoRollbackEnabled/)
  assert.match(coach, /onRefreshRun/)
  assert.doesNotMatch(coach, /fetch\(|window\.setTimeout|Math\.random/)
  assert.doesNotMatch(journey, /Date\.now\(|Math\.random\(/)
})

test('unrelated run success cannot trigger completion or independent certification in the wrong mode', () => {
  assert.match(journey, /const hasCurrentRun = Boolean\(input\.runId\) && input\.runMode === input\.mode/)
  assert.match(consoleUi, /coverage\?\.mode === autonomousMode && matchesCurrentRun \? orchestratorRunId : ''/)
  assert.match(consoleUi, /coverage\?\.mode === autonomousMode && matchesCurrentRun \? Number\(summaryRow\.executed/)
  assert.match(consoleUi, /\['WAITING_APPROVAL', 'RUNNING'\]\.includes\(String\(coverage\?\.status/)
  assert.match(consoleUi, /matchesCurrentRun && coverage\?\.status === 'SUCCEEDED'/)
  assert.match(consoleUi, /coverage\?\.mode === persistedPolicy\?\.mode/)
  assert.match(consoleUi, /const runRequest = useRef\(0\)/)
  assert.match(consoleUi, /if \(requestId !== runRequest\.current\) return/)
  assert.match(consoleUi, /runRequest\.current \+= 1\n            readinessRequest\.current \+= 1\n            setAutoProjectScopeAcknowledged\(false\)/)
  assert.match(consoleUi, /setPersistedPolicy\(null\)\n            setCoverage\(null\)\n            setProjectId\(nextId\)/)
})

test('changed goal and older policy evidence cannot advance either mode', () => {
  assert.match(consoleUi, /matchesGovernanceRunIdentity\(\{/)
  assert.match(consoleUi, /goalFingerprint\?\.goal === goal \? goalFingerprint\.hash : null/)
  assert.match(consoleUi, /crypto\.subtle\.digest\('SHA-256', new TextEncoder\(\)\.encode\(goal\)\)/)
  assert.match(consoleUi, /runId: matchesCurrentRun \? orchestratorRunId : null/)
  assert.match(consoleUi, /certificationReady = matchesCurrentRun/)
  assert.match(consoleUi, /if \(!projectId \|\| !canCertify \|\| !orchestratorRunId \|\| !matchesCurrentRun\) return/)
  assert.match(consoleUi, /await refreshRunState\(\)/)
  assert.doesNotMatch(consoleUi, /setCoverage\(\{ \.\.\.body, mode:/)
  assert.match(consoleUi, /disabled=\{busy\} onChange=\{event => \{/)
})


test('GUIDED identity nested in the shared console cannot reuse evidence from another selected scope', () => {
  assert.match(consoleUi, /guidedScope: policy\.mode === 'GUIDED'/)
  assert.match(consoleUi, /scopeVersionId: guidedSourceId !== '' \? readiness\?\.scopes\[0\]\?\.scopeVersionId/)
  assert.match(consoleUi, /onChooseSource=\{sourceId => \{ setGuidedSourceId\(sourceId\); setMessage\(''\) \}\}/)
})
