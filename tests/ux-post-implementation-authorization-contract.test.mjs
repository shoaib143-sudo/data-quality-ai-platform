import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=path=>fs.readFileSync(path,'utf8')

test('dataset mutations retain resource and source authorization',()=>{
  const source=read('app/api/datasets/[datasetId]/route.ts')
  assert.ok(source.includes("authorizeDataset(user.id, datasetId, 'catalog.update')"))
  assert.ok(source.includes("if (sourceRequiresMutation) await authorizeProject(user.id, dataset.project_id, 'source.manage')"))
})

test('source credential and registration writes require source.manage',()=>{
  const credentials=read('app/api/datasets/source/credentials/route.ts')
  const register=read('app/api/datasets/source/register/route.ts')
  assert.ok(credentials.includes("authorizeProject(user.id, projectId, 'source.manage')"))
  assert.ok(register.includes("authorizeProject(user.id, projectId, 'source.manage')"))
  assert.ok(!register.includes("authorizeProject(user.id, projectId, 'catalog.read')"))
})

test('read-only discovery authorizes before external connection',()=>{
  const source=read('app/api/datasets/source/discover/route.ts')
  const auth=source.indexOf("authorizeProject(user.id, projectId, 'catalog.read')")
  const discover=source.indexOf('discoverNativeHierarchy')
  assert.ok(auth>=0)
  assert.ok(discover>auth)
  assert.ok(source.includes('validCredentialRef(credentialRef)'))
})

test('organization member mutations reauthorize and protect the last owner',()=>{
  const source=read('app/api/admin/members/route.ts')
  assert.ok((source.match(/authorizeOrganizationAdmin\(user\.id, organizationId\)/g)||[]).length>=3)
  assert.ok(source.includes('Only an organization OWNER can grant the OWNER role.'))
  assert.ok(source.includes('The last organization OWNER cannot be demoted.'))
  assert.ok(source.includes('The last organization OWNER cannot be removed.'))
})

test('autonomous governance separates view, manage, execute and certify authority',()=>{
  const orchestrator=read('app/api/agents/governance-orchestrator/route.ts')
  const certify=read('app/api/agents/governance-orchestrator/certify/route.ts')
  assert.ok(orchestrator.includes("authorizeProject(user.id, projectId, 'agent.view')"))
  assert.ok(orchestrator.includes("authorizeProject(user.id, projectId, 'admin.manage')"))
  assert.ok(orchestrator.includes("authorizeProject(user.id, projectId, 'agent.execute')"))
  assert.ok(certify.includes("authorizeProject(user.id, projectId, 'certification.review')"))
})

test('agent run evidence remains object- and action-authorized',()=>{
  const source=read('app/agents/runs/[runId]/page.tsx')
  assert.ok(source.includes('canViewExecutionRun(user.id, run as AgentRun)'))
  assert.ok(source.includes("'execution.view_evidence'"))
  assert.ok(source.includes('catch {\n    notFound()'))
})

test('AI Insights authorizes before privileged evidence reads',()=>{
  const source=read('app/ai-insights/page.tsx')
  const auth=source.indexOf("await authorizeProject(user.id, selectedProjectId, 'catalog.read')")
  const admin=source.indexOf('createAdminClient()')
  assert.ok(auth>=0)
  assert.ok(admin>auth)
})
