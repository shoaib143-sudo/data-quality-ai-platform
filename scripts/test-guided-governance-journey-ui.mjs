import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const coach = readFileSync('app/agents/autonomous-governance/guided-run-coach.tsx', 'utf8')
const physicalAssets = readFileSync('app/catalog/physical-assets/page.tsx', 'utf8')
const physicalAssetManager = readFileSync('app/catalog/physical-assets/physical-asset-manager.tsx', 'utf8')
const consoleUi = readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const approvalUi = readFileSync('app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', 'utf8')
const approvalApi = readFileSync('app/api/agents/governance-orchestrator/approvals/route.ts', 'utf8')
const readinessApi = readFileSync('app/api/agents/governance-orchestrator/guided-readiness/route.ts', 'utf8')
const page = readFileSync('app/agents/autonomous-governance/page.tsx', 'utf8')
const scope = readFileSync('lib/orchestration/governance-guided-source-selection.ts', 'utf8')
const runtime = readFileSync('lib/orchestration/governance-orchestrator-service-v2.ts', 'utf8')
const resume = readFileSync('lib/orchestration/governance-orchestrator-approval-service.ts', 'utf8')
const endpoint = readFileSync('app/api/agents/governance-orchestrator/route.ts', 'utf8')
const runIdentity = readFileSync('lib/orchestration/governance-journey-run-identity.ts', 'utf8')

test('the actual GUIDED journey is visible with seven numbered steps and an actionable on-screen instruction', () => {
  for (const label of ['GUIDED governance E2E','Do this now','Select project','Verify tables',
    'Activate GUIDED','Submit goal','Human approval','Review evidence','Independent certification']) {
    assert.ok(coach.includes(label), label)
  }
  assert.match(coach, /aria-live="polite"/)
  assert.match(coach, /aria-current=\{current \? 'step'/)
  assert.match(coach, /href=\{instruction.target\}/)
  assert.match(coach, /min-h-10/)
  assert.match(coach, /text-sm/)
  assert.match(coach, /border-amber/)
})
test('guided source preflight uses real project-scoped catalog state, not fabricated progress', () => {
  assert.match(readinessApi, /requireApiUser\(\)/)
  assert.match(readinessApi, /authorizeProject\(user\.id, projectId, 'agent\.view'\)/)
  assert.match(readinessApi, /\.eq\('project_id', projectId\)/)
  assert.match(readinessApi, /current_version_id/)
  assert.match(readinessApi, /source_identifier/)
  assert.match(readinessApi, /dataset_execution_sources/)
  assert.match(readinessApi, /is_current/)
  assert.match(readinessApi, /'Cache-Control': 'no-store'/)
  assert.doesNotMatch(readinessApi, /jdbc_url|credential_ref|service_role/)
  assert.match(coach, /readiness\.readyCount/)
  assert.match(coach, /readiness\.tables\.map/)
  assert.match(coach, /NOT_REGISTERED/)
  assert.match(coach, /Live E2E prerequisites blocked/)
  assert.match(coach, /currentScopeDiscovery/)
  assert.match(coach, /participantReadiness/)
  assert.match(coach, /operatorCapabilities/)
  assert.match(readinessApi, /CURRENT_SCOPE_DISCOVERY_EVIDENCE_MISSING/)
  assert.match(readinessApi, /PROJECT_ROLE_BINDINGS_MISSING/)
  assert.match(readinessApi, /e2eReady/)
})
test('unsaved policy and emergency-stop state block the run, and paused approvals are polled', () => {
  assert.match(consoleUi, /setPersistedPolicy\(body\.policy\)/)
  assert.match(consoleUi, /persistedGuidedReady/)
  assert.match(consoleUi, /!readiness\?\.ready/)
  assert.match(consoleUi, /persistedPolicy\.emergencyStop/)
  assert.match(consoleUi, /hasUnsavedPolicyEdits/)
  assert.match(consoleUi, /executionBlocked/)
  assert.match(consoleUi, /'WAITING_APPROVAL', 'RUNNING'/)
  assert.match(consoleUi, /window\.setInterval/)
  assert.match(consoleUi, /role="status" aria-live="polite"/)
  assert.match(page, /initialProjectId/)
})
test('reviewer sees exact user-submitted goal and must confirm; execution authority checked on ready requests', () => {
  assert.match(approvalApi, /originalGoal: canViewGoal \? text\(parameters\.goal\) : ''/)
  assert.match(approvalApi, /authorizeProject\(user\.id, projectId, 'agent\.execute'\)/)
  assert.match(approvalUi, /approval\.originalGoal/)
  assert.match(approvalUi, /confirmedByApproval/)
  assert.match(approvalUi, /readOnly value=\{goalByApproval\[approval\.id\]/)
  assert.match(approvalUi, /!approval\.originalGoal \|\| !confirmedByApproval\[approval\.id\]/)
  assert.match(approvalUi, /Approval resumes only the exact paused run, never certifies it/)
  assert.doesNotMatch(approvalUi, /DEFAULT_GOAL/)
})

test('GUIDED actor separation and goal privacy fail closed in the approval API', () => {
  assert.match(approvalApi, /String\(row\.requested_by\) !== user\.id && authorityMatches/)
  assert.match(approvalApi, /String\(approval\.requested_by\) === user\.id/)
  assert.match(approvalApi, /The execution requester cannot approve their own governance run/)
  assert.match(approvalApi, /canDecide \|\| String\(row\.requested_by\) === user\.id/)
  assert.doesNotMatch(approvalApi, /context: payload/)
})

test('GUIDED source dispatch checks authoritative current-scope profiling evidence', () => {
  assert.match(readinessApi, /verify_dataset_version_profile_readiness/)
  assert.match(scope, /verify_dataset_version_profile_readiness/)
  assert.match(coach, /PROFILE_READINESS_BLOCKED/)
  assert.match(coach, /table\.blockerCodes/)
})

test('independent certification is not represented as complete on execution success alone', () => {
  assert.match(consoleUi, /certificationReady/)
  assert.match(consoleUi, /summaryRow\.certificationEligible === true/)
  assert.match(consoleUi, /assessment_state/)
  assert.match(consoleUi, /!certificationReady/)
  assert.match(coach, /cannot grant approvals or certify a run/)
})

test('one enumerated source alone gates the test, not unrelated ALL-mode project sources', () => {
  assert.match(readinessApi, /requestedSourceId/)
  assert.match(readinessApi, /sourceOptions/)
  assert.match(readinessApi, /selectedScopes = scopes\.filter/)
  assert.match(readinessApi, /selectedSourceIds = selectedScopes\.map/)
  assert.match(coach, /guided-source-select/)
  assert.match(coach, /Review and request asset promotions/)
})
test('server binds current scoped datasets and fences changed pending approvals', () => {
  assert.match(scope, /current_version_id/)
  assert.match(scope, /\.eq\('project_id', input\.projectId\)/)
  assert.match(scope, /\.eq\('is_current', true\)/)
  assert.match(scope, /scopeHash/)
  assert.match(scope, /datasetVersionIds: selectedVersions/)
  assert.match(runtime, /guidedScope = policy\.mode === 'GUIDED'/)
  assert.match(runtime, /attachLatestDatasetVersions\(input\.projectId, capabilityRunId, guidedScope\)/)
  assert.match(runtime, /sourceScopeVersionId/)
  assert.match(endpoint, /selectedDatasetVersionIds/)
  assert.match(resume, /sameBoundGuidedScope\(expected, observed\)/)
  assert.match(resume, /attachLatestDatasetVersions\(input\.projectId, capabilityRunId, guidedScope\)/)
  assert.match(coach, /Only the datasets you select should be included in this run/)
  assert.match(consoleUi, /sourceScopeVersionId: readiness\?\.scopes\[0\]\?\.scopeVersionId/)
  assert.match(approvalApi, /sourceScopeVersionId|originalGoal/)
})

test('an actual GUIDED user can open each missing asset in the real governed promotion workflow', () => {
  assert.match(coach, /table\.status === 'NOT_REGISTERED'/)
  assert.match(coach, /\/catalog\/physical-assets\?sourceId=/)
  assert.match(coach, /encodeURIComponent\(table\.qualifiedName\)/)
  assert.match(physicalAssets, /initialSourceId=/)
  assert.match(physicalAssets, /initialQuery=/)
  assert.match(physicalAssetManager, /setQuery\]=useState\(initialQuery\)/)
  assert.match(physicalAssetManager, /setSourceFilter\]=useState\(initialSourceId\)/)
  assert.match(physicalAssetManager, /Accept AI recommendation for review/)
  assert.match(physicalAssetManager, /Promote to governed catalog/)
})


test('governance-only GUIDED goals do not require or implicitly attach any dataset, including on approval resume', () => {
  assert.match(runtime, /policy\.mode === 'GUIDED' && input\.sourceScopeVersionId/)
  assert.match(runtime, /policy\.mode === 'GUIDED' && !guidedScope/)
  assert.match(resume, /trace\.guided_scope_mode === 'EXPLICIT'/)
  assert.match(resume, /policy\.mode === 'GUIDED' && !guidedScope/)
  assert.match(runtime, /if \(!datasetVersionIds\.length && !\(policy\.mode === 'GUIDED' && !guidedScope\)\)/)
  assert.match(resume, /if \(!datasetVersionIds\.length && !\(policy\.mode === 'GUIDED' && !guidedScope\)\)/)
})

test('approved GUIDED scope cannot silently degrade into an unscoped run', () => {
  assert.match(runtime, /guided_scope_mode: guidedScope \? 'EXPLICIT' : 'NONE'/)
  assert.match(resume, /trace\.guided_scope_mode === 'EXPLICIT'/)
  assert.match(resume, /trace\.guided_scope_mode === 'NONE'/)
  assert.match(resume, /Object\.prototype\.hasOwnProperty\.call\(trace, 'guided_scope'\)/)
  assert.match(resume, /missing its immutable source-scope marker/)
  assert.match(resume, /contains contradictory source-scope data/)
  assert.match(resume, /missing its exact approved scope snapshot/)
})


test('GUIDED walkthrough progress is fenced to the exact persisted goal, policy and source scope', () => {
  assert.match(consoleUi, /matchesGovernanceRunIdentity\(\{/)
  assert.match(consoleUi, /crypto\.subtle\.digest\('SHA-256', new TextEncoder\(\)\.encode\(goal\)\)/)
  assert.match(consoleUi, /guidedScope: policy\.mode === 'GUIDED'/)
  assert.match(consoleUi, /scopeVersionId: guidedSourceId !== '' \? readiness\?\.scopes\[0\]\?\.scopeVersionId/)
  assert.match(consoleUi, /runId: matchesCurrentRun \? orchestratorRunId : null/)
  assert.match(consoleUi, /certificationReady = matchesCurrentRun/)
  assert.match(consoleUi, /!projectId \|\| !canCertify \|\| !orchestratorRunId \|\| !matchesCurrentRun/)
  assert.match(consoleUi, /await refreshRunState\(\)/)
  assert.doesNotMatch(consoleUi, /setCoverage\(\{ \.\.\.body, mode:/)
  assert.match(runIdentity, /trace\.guided_scope_mode !== 'EXPLICIT'/)
  assert.match(runIdentity, /snapshot\.scope_version_id === input\.guidedScope\.scopeVersionId/)
  assert.match(runIdentity, /trace\.guided_scope_mode === 'NONE'/)
  assert.match(runIdentity, /!Object\.prototype\.hasOwnProperty\.call\(trace, 'guided_scope'\)/)
})

test('shared-environment UI keeps a real active run single-flight while allowing a new goal after prior success', () => {
  assert.match(consoleUi, /\['WAITING_APPROVAL', 'RUNNING'\]\.includes\(String\(coverage\?\.status/)
  assert.match(consoleUi, /matchesCurrentRun && coverage\?\.status === 'SUCCEEDED'/)
  assert.match(consoleUi, /disabled=\{busy\} onChange=\{event => \{/)
  assert.match(consoleUi, /runRequest\.current \+= 1/)
})


test('GUIDED execution is fail-closed on full live E2E readiness and exposes governed blocker actions', () => {
  assert.match(consoleUi, /readiness\?\.e2eReady !== true/)
  assert.match(consoleUi, /\/api\/catalog\/discovery/)
  assert.match(consoleUi, /Idempotency-Key/)
  assert.match(consoleUi, /operatorCapabilities\?\.discoveryExecute/)
  assert.match(coach, /Run fresh discovery/)
  assert.match(coach, /CURRENT_SCOPE_DISCOVERY_EVIDENCE_MISSING/)
  assert.match(coach, /Manage project participants/)
  assert.match(coach, /\/admin\/project-roles/)
  assert.match(coach, /PROJECT_ROLE_BINDINGS_MISSING/)
})


test('GUIDED source preflight avoids retry loops when the provider credential is invalid', () => {
  assert.match(coach, /DISCOVERY_INVALID_CREDENTIAL/)
  assert.match(coach, /Update source credential/)
  assert.match(coach, /href="\/datasets"/)
  assert.match(coach, /!readiness\.preflightBlockerCodes\?\.includes\('DISCOVERY_INVALID_CREDENTIAL'\)/)
  assert.match(coach, /Stored source credential is no longer accepted by the provider/)
})
