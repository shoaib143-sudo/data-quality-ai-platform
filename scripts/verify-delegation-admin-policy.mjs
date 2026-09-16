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
const authorityUi = read('app/approvals/direct-authority-admin-manager.tsx')
const authorityRoute = read('app/api/agent-approvals/authorities/admin/route.ts')
const authorityMigration = read('supabase/migrations/20260916120000_governed_direct_approval_authority_assignment.sql')
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

requireText(service, 'createGovernanceAdminApprovalAuthority', 'Governance-admin service must expose direct authority assignment.')
requireText(service, "hasProjectCapability(input.adminUserId, projectId, 'admin.manage')", 'Direct authority assignment must re-authorize admin.manage server-side.')
requireText(service, 'resolveInstanceOrganizationMembership(input.adminUserId)', 'Direct authority assignment must bind the actor to the instance organization.')
requireText(service, "if (!approverMembership) throw new Error('Approver must be an individual member of this DataNexus organization.')", 'Direct authority assignment must reject non-members.')
requireText(service, "if (input.adminUserId === input.approverUserId) throw new Error('Administrators cannot assign direct approval authority to themselves.')", 'Direct authority assignment must reject self-assignment.')
requireText(service, 'loadManagedDomains([projectId])', 'Direct authority assignment must validate the governed project/domain boundary.')
requireText(service, "rpc('assign_agent_approval_authority'", 'Direct authority assignment must use the transaction-safe database RPC.')
requireText(service, 'Delegation action scope cannot exceed the direct approval authority.', 'Delegations must not exceed direct-authority action scope.')
requireText(service, 'Delegation risk ceiling cannot exceed the direct approval authority.', 'Delegations must not exceed direct-authority risk ceiling.')

requireText(authorityRoute, 'requireApiUser()', 'Direct authority admin API must require an authenticated user.')
requireText(authorityRoute, 'createGovernanceAdminApprovalAuthority', 'Direct authority admin API must route through the governed service.')
requireText(authorityRoute, "approvalAxis must be BUSINESS or GOVERNANCE.", 'Direct authority API must reject unknown approval axes.')
requireText(authorityRoute, "maxRisk must be LOW, MEDIUM, HIGH, or CRITICAL.", 'Direct authority API must reject unknown risk ceilings.')
requireText(authorityUi, '/api/agent-approvals/authorities/admin', 'Direct authority UI must use the governed admin API.')
requireText(authorityUi, 'No wildcard grant is created.', 'Direct authority UI must communicate explicit action scoping.')
requireText(authorityUi, 'enforce separation of duties server-side', 'Direct authority UI must communicate server-authoritative SoD.')

requireText(authorityMigration, 'add column if not exists action_keys text[] not null', 'Direct authorities must persist explicit action scope.')
requireText(authorityMigration, "add column if not exists max_risk text not null default 'CRITICAL'", 'Direct authorities must persist an explicit risk ceiling.')
requireText(authorityMigration, "p_action_key = any(a.action_keys)", 'Direct authority evaluation must enforce the action allowlist.')
requireText(authorityMigration, 'governance.agent_risk_rank(p_risk) <= governance.agent_risk_rank(a.max_risk)', 'Direct authority evaluation must enforce the risk ceiling.')
requireText(authorityMigration, 'perform pg_advisory_xact_lock(v_lock_key)', 'Direct authority assignment must serialize concurrent assignments per subject/scope.')
requireText(authorityMigration, 'Administrators cannot assign direct approval authority to themselves', 'Database assignment must reject self-assignment independently of the API.')
requireText(authorityMigration, 'The same individual cannot hold overlapping Business and Governance authority for one project/domain', 'Database assignment must enforce separation of duties.')
requireText(authorityMigration, 'An overlapping direct approval authority already exists for this person, project, domain and axis', 'Database assignment must reject overlapping duplicates.')
requireText(authorityMigration, 'Authority assignment requires at least one explicitly scoped action', 'Database assignment must reject an empty action allowlist.')
requireText(authorityMigration, 'Unsupported governed agent action', 'Database assignment must reject unknown actions.')
requireText(authorityMigration, 'Approval domain is not governed by this project', 'Database assignment must reject unknown project domains.')
requireText(authorityMigration, 'Approver must be an individual member of the project organization', 'Database assignment must reject non-members.')
requireText(authorityMigration, 'agent_approval_authority_audit', 'Direct authority assignment must persist immutable audit provenance.')
requireText(authorityMigration, 'revoke all on governance.agent_approval_authority_audit from public, anon, authenticated', 'Authority audit table must remain outside browser mutation/read authority.')
requireText(authorityMigration, 'revoke all on function governance.assign_agent_approval_authority', 'Authority assignment RPC must not be callable by browser roles.')
requireText(authorityMigration, 'grant execute on function governance.assign_agent_approval_authority', 'Authority assignment RPC must be service-role executable.')

requireText(page, '<DirectAuthorityAdminManager />', 'Approvals workspace must expose direct authority administration controls.')
requireText(page, '<DelegationAdminManager />', 'Approvals workspace must preserve governance-admin delegation controls.')

console.log('Delegation and direct approval authority administration policy contract verified.')
