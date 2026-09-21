import assert from 'node:assert/strict'
import fs from 'node:fs'

const datasetForm=fs.readFileSync('app/datasets/dataset/[datasetId]/edit/edit-dataset-form.tsx','utf8')
const sourceForm=fs.readFileSync('app/datasets/edit/[sourceId]/edit-source-form.tsx','utf8')
const adminManager=fs.readFileSync('app/admin/admin-manager.tsx','utf8')
const autonomy=fs.readFileSync('app/agents/autonomous-governance/autonomy-console.tsx','utf8')
const orchestrator=fs.readFileSync('app/api/agents/governance-orchestrator/route.ts','utf8')
const adminMembers=fs.readFileSync('app/api/admin/members/route.ts','utf8')
const discover=fs.readFileSync('app/api/datasets/source/discover/route.ts','utf8')

assert.ok(datasetForm.includes("if (!name.trim() || !sourceId || !sourceIdentifier.trim()) throw new Error"),'negative: dataset edit must reject incomplete required fields before mutation')
assert.ok(datasetForm.includes("if (!response.ok) throw new Error"),'negative: dataset edit must surface non-2xx mutation failures')
assert.ok(datasetForm.includes("finally {\n      setBusy(false)"),'negative: dataset edit must recover its busy state after failure')

assert.ok(sourceForm.includes("if (!jdbcUrl.trim()) throw new Error('JDBC URL is required.')"),'negative: source discovery must reject empty JDBC URLs')
assert.ok(sourceForm.includes("if (!hierarchy) throw new Error('Connect and discover the current source hierarchy before saving.')"),'negative: source edit must not save an undiscovered hierarchy')
assert.ok(sourceForm.includes("if (selectionMode === 'SELECTED' && selectedNodeIds.length === 0) throw new Error"),'negative: selected hierarchy mode must reject an empty selection')
assert.ok(sourceForm.includes("if (!response.ok) throw new Error"),'negative: source edit must surface remote/API failures')
assert.ok(sourceForm.includes("disabled={busy || !hierarchy}"),'negative: source save CTA must remain disabled until discovery succeeds')

assert.ok(adminManager.includes("if(!response.ok) throw new Error"),'negative: admin membership UI must surface API failures')
assert.ok(adminMembers.includes("The last organization OWNER cannot be demoted."),'negative: role changes must preserve last-owner protection')
assert.ok(adminMembers.includes("The last organization OWNER cannot be removed."),'negative: removals must preserve last-owner protection')

assert.ok(autonomy.includes("if (!projectId || !canManage) return"),'negative: autonomy policy save must fail closed in the client when manage authority is absent')
assert.ok(autonomy.includes("if (!projectId || !canExecute || !goal.trim()) return"),'negative: orchestrator execution must fail closed in the client when execution authority is absent')
assert.ok(autonomy.includes("if (!projectId || !canCertify || !orchestratorRunId) return"),'negative: certification must fail closed in the client when certification authority is absent')
assert.ok(orchestrator.includes("if (goal.length > 2000)"),'negative: orchestrator goal input must remain bounded server-side')
assert.ok(orchestrator.includes("if (!['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'].includes(mode))"),'negative: autonomy mode must be allow-listed')
assert.ok(orchestrator.includes("if (mode === 'OFF' && enabled)"),'negative: invalid enabled OFF policy must be rejected')

const authIndex=discover.indexOf("await authorizeProject(user.id, projectId, 'source.manage')")
const bindingIndex=discover.indexOf('credentialRefBelongsToProject(credentialRef, projectId)')
const discoveryIndex=discover.indexOf('await discoverNativeHierarchy')
assert.ok(authIndex>=0 && bindingIndex>authIndex && discoveryIndex>bindingIndex,'negative: external hierarchy discovery must require source.manage and project-bound credentials before initiating remote discovery')
assert.ok(discover.includes('validCredentialRef(credentialRef)'),'negative: discovery must validate credential references before use')
assert.ok(discover.includes("code: 'CREDENTIAL_PROJECT_MISMATCH'"),'negative: cross-project credential references must fail closed')

console.log('Post-implementation negative and failure-path audit passed.')
