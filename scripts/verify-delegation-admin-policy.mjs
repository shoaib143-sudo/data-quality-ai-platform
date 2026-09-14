import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const service = read('lib/governance/delegation-admin-service.ts')
const selfService = read('lib/governance/agent-approval-service.ts')
const adminUi = read('app/approvals/delegation-admin-manager.tsx')
const page = read('app/approvals/page.tsx')

requireText(service, "hasProjectCapability(userId, String(project.id), 'admin.manage')", 'Admin workspace must be limited to projects with admin.manage.')
requireText(service, "hasProjectCapability(input.adminUserId, projectId, 'admin.manage')", 'Admin creation must re-authorize admin.manage server-side.')
requireText(service, "hasProjectCapability(input.adminUserId, String(delegation.project_id), 'admin.manage')", 'Admin revocation must re-authorize admin.manage server-side.')
requireText(service, "if (!input.projectId.trim()) throw new Error('Governance-admin delegation must be narrowed to a managed project.')", 'Admin-created delegation must be project scoped.')
requireText(service, 'delegator_user_id: authority.user_id', 'Admin management must preserve the direct authority holder as delegator of record.')
requireText(service, 'created_by: input.adminUserId', 'Admin creation provenance must retain the actual administrator actor.')
requireText(service, 'revoked_by: input.adminUserId', 'Admin revocation provenance must retain the actual administrator actor.')
requireText(service, "if (!delegation.project_id) throw new Error('Domain-wide delegation can only be revoked by its delegator.')", 'Admin path must fail closed for domain-wide revocation without project scope.')
requireText(selfService, "if (String(delegation.delegator_user_id) !== input.revokedBy) throw new Error('Only the delegator can revoke this approval delegation.')", 'Delegate self-service must remain unable to revoke another user’s delegation.')
requireText(adminUi, '/api/agent-approvals/delegations/admin', 'Governance-admin UI must use the governed admin API.')
requireText(adminUi, 'Delegates remain view-only and cannot alter delegated authority.', 'UX must state the frozen delegate view-only boundary.')
requireText(page, '<DelegationAdminManager />', 'Approvals workspace must expose governance-admin delegation controls.')

console.log('Delegation administration policy contract verified.')
