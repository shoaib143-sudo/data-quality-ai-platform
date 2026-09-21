import assert from 'node:assert/strict'
import fs from 'node:fs'

const datasetPage=fs.readFileSync('app/datasets/dataset/[datasetId]/edit/page.tsx','utf8')
const sourcePage=fs.readFileSync('app/datasets/edit/[sourceId]/page.tsx','utf8')
const sourceRegister=fs.readFileSync('app/api/datasets/source/register/route.ts','utf8')
const datasetRoute=fs.readFileSync('app/api/datasets/[datasetId]/route.ts','utf8')
const credentialRoute=fs.readFileSync('app/api/datasets/source/credentials/route.ts','utf8')
const discoverRoute=fs.readFileSync('app/api/datasets/source/discover/route.ts','utf8')
const agentDetail=fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx','utf8')
const runPage=fs.readFileSync('app/agents/runs/[runId]/page.tsx','utf8')

assert.ok(datasetPage.includes("authorizeDataset(user.id, datasetId, 'catalog.update')"), 'negative: dataset editor must require catalog.update before rendering mutation controls')
assert.ok(datasetPage.includes('catch { notFound() }'), 'negative: unauthorized dataset edits must fail closed')
assert.ok(!datasetPage.includes("['OWNER', 'ADMIN', 'MEMBER']"), 'negative: broad membership alone must not grant dataset edit controls')

assert.ok(sourcePage.includes("authorizeProject(user.id, source.project_id, 'source.manage')"), 'negative: source editor must require source.manage before rendering mutation controls')
assert.ok(sourcePage.includes('catch { notFound() }'), 'negative: unauthorized source edits must fail closed')
assert.ok(!sourcePage.includes("['OWNER', 'ADMIN', 'MEMBER']"), 'negative: broad membership alone must not grant source edit controls')

assert.ok(sourceRegister.includes("authorizeProject(user.id, projectId, 'source.manage')"), 'negative: source registration/update mutation must require source.manage')
assert.ok(!sourceRegister.includes("authorizeProject(user.id, projectId, 'catalog.read')"), 'negative: catalog.read must never authorize source registration/update mutation')
assert.ok(sourceRegister.includes("if (!projectId || !name || !sourceUri)"), 'negative: missing source registration fields must return a validation error')
assert.ok(sourceRegister.includes("if (!['JDBC', 'CSV', 'FILE'].includes(sourceType))"), 'negative: unsupported source types must fail validation')
assert.ok(sourceRegister.includes("if (sourceId && !existing) return NextResponse.json({ error: 'Connection access denied.' }, { status: 403 })"), 'negative: cross-project or missing edited source must fail closed')

assert.ok(datasetRoute.includes("authorizeDataset(user.id, datasetId, 'catalog.update')"), 'negative: dataset PATCH must require catalog.update')
assert.ok(datasetRoute.includes("if (!name || !sourceIdentifier || !sourceId)"), 'negative: incomplete dataset PATCH must return 400')
assert.ok(datasetRoute.includes("status: 409"), 'negative: duplicate dataset names must produce conflict')
assert.ok(datasetRoute.includes("status: 422"), 'negative: failed source validation must block dataset mutation')

assert.ok(credentialRoute.includes("authorizeProject(user.id, projectId, 'source.manage')"), 'negative: credential provisioning must require source.manage')
assert.ok(credentialRoute.includes("code: 'CONNECTOR_UNAVAILABLE'"), 'negative: unavailable JDBC bridge must surface explicit failure code')
assert.ok(discoverRoute.includes("code: 'INVALID_CREDENTIAL_REF'"), 'negative: malformed credential refs must fail before discovery')
assert.ok(discoverRoute.includes("code: 'PROJECT_ACCESS_DENIED'"), 'negative: unauthorized source discovery must return a governed access failure')

assert.ok(agentDetail.includes("filterAuthorizedExecutionRuns(user.id"), 'negative: Agent Detail run evidence must be filtered through the canonical run-visibility helper')
assert.ok(agentDetail.includes(".select('id, project_id, dataset_id, status, created_at, completed_at, error_code')"), 'negative: Agent Detail must retain the resource scope required for authorization decisions')
assert.ok(!agentDetail.includes("const runs = (runsResult.data ?? []) as AgentRun[]"), 'negative: Agent Detail must never expose the raw run query result directly')

assert.ok(runPage.includes('if (!await canViewExecutionRun(user.id, run as AgentRun)) notFound()'), 'negative: unauthorized run evidence must fail closed')
assert.ok(runPage.includes("authorizeAgentAction("), 'negative: run evidence must retain agent action authorization')
assert.ok(runPage.includes('catch {\n    notFound()\n  }'), 'negative: agent authorization failure must not leak run existence')

const login=fs.readFileSync('app/login/page.tsx','utf8')
const signup=fs.readFileSync('app/signup/page.tsx','utf8')
const forgot=fs.readFileSync('app/forgot-password/page.tsx','utf8')
const reset=fs.readFileSync('app/reset-password/page.tsx','utf8')
const externalApproval=fs.readFileSync('app/approvals/external/[token]/page.tsx','utf8')
const authCallback=fs.readFileSync('app/auth/callback/route.ts','utf8')
for(const source of [login,signup,authCallback]) assert.ok(source.includes('safeAuthReturnPath'), 'negative: auth redirects must use the shared same-origin return-path validator')
assert.ok(!login.includes('function safeNext(') && !signup.includes('function safeNext(') && !authCallback.includes('function safeNext('), 'negative: auth surfaces must not reintroduce ad-hoc redirect validation')
assert.ok(login.includes('name="email"') && login.includes('name="password"'), 'negative: login controls must retain password-manager field metadata')
assert.ok(signup.includes('name="email"') && signup.includes('name="password"'), 'negative: signup controls must retain password-manager field metadata')
assert.ok(forgot.includes('name="email"') && forgot.includes('autoComplete="email"'), 'negative: password recovery email must retain autocomplete metadata')
assert.ok(reset.includes('name="new-password"') && reset.includes('name="confirm-password"') && reset.includes('autoComplete="new-password"'), 'negative: password reset fields must retain password-manager metadata')
assert.ok(login.includes('role="alert"'), 'negative: login authentication errors must be announced accessibly')
assert.ok(signup.includes('role="alert"'), 'negative: signup failures must be announced accessibly')
assert.ok(forgot.includes('role="alert"') && forgot.includes('role="status"'), 'negative: password-reset request must distinguish failure and neutral success state')
assert.ok(reset.includes('role="alert"'), 'negative: password update failures must be announced accessibly')
assert.ok(externalApproval.includes('This signed approval link was issued to a different DataNexus user.'), 'negative: identity-mismatched approval links must fail closed')
assert.ok(externalApproval.includes('<ExternalApprovalDecisionForm'), 'negative: valid signed approval links must retain the governed decision form')

console.log('Wave 13 authorization, negative and failure-case contract passed.')
