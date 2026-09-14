import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const service = read('lib/governance/resource-access-admin-service.ts')
const api = read('app/api/resource-access/route.ts')
const revokeApi = read('app/api/resource-access/[grantId]/revoke/route.ts')
const manager = read('app/resource-access/resource-access-manager.tsx')
const page = read('app/resource-access/page.tsx')

requireText(service, "hasProjectCapability(userId, String(project.id), 'admin.manage')", 'Workspace must include only projects the user can administer.')
requireText(service, "hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage')", 'Grant creation must re-authorize admin.manage server-side.')
requireText(service, "hasProjectCapability(input.actorUserId, String(grant.project_id), 'admin.manage')", 'Grant revocation must re-authorize admin.manage server-side.')
requireText(service, ".eq('resource_type', 'DATASET')", 'Existing-rule checks must remain dataset scoped.')
requireText(service, "effect: input.effect", 'Grant creation must preserve explicit ALLOW/DENY choice.')
requireText(service, 'created_by: input.actorUserId', 'Grant creation must retain actor provenance.')
requireText(service, 'revoked_by: input.actorUserId', 'Revocation must retain actor provenance.')
requireText(service, 'Revoke it before replacing the rule.', 'Conflicting active rules must be replaced explicitly, not silently overwritten.')
requireText(api, 'requireApiUser()', 'Resource ACL API must require authentication.')
requireText(revokeApi, 'requireApiUser()', 'Resource ACL revoke API must require authentication.')
requireText(manager, 'DENY always wins.', 'UX must explain DENY precedence.')
requireText(manager, 'ordinary project members must have an explicit ALLOW', 'UX must explain allow-list behavior when ACL rules exist.')
requireText(page, 'Server-side authorization remains authoritative', 'Page must state the server-authoritative authorization boundary.')

console.log('Resource ACL administration contract verified.')
