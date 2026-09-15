import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  }
}

const helper = read('lib/auth/data-governance-super-admin.ts')
const authorize = read('lib/auth/authorize.ts')
const resourceAuthorization = read('lib/governance/resource-authorization.ts')
const profilingRun = read('app/api/agents/run/route.ts')
const cleanup = read('app/api/admin/cleanup/route.ts')
const consoleUi = read('app/admin/cleanup/cleanup-console.tsx')
const migration = read('supabase/migrations/20260914184500_data_governance_admin_super_admin.sql')
const createProject = read('app/api/datasets/create-project/route.ts')

expect(helper.includes("DATA_GOVERNANCE_SUPER_ADMIN_ROLE = 'DATA_GOVERNANCE_ADMIN'"), 'Super Admin authority must be bound to DATA_GOVERNANCE_ADMIN.')
expect(authorize.includes('export async function hasOrganizationWideDataGovernanceSuperAdminCapability'), 'Organization-wide Super Admin capability resolution must be reusable by governed resource authorization.')
expect(authorize.includes(".eq('role_key', 'DATA_GOVERNANCE_ADMIN')"), 'Organization-wide Super Admin fallback must require the explicit DATA_GOVERNANCE_ADMIN role.')
expect(authorize.includes("role.capabilities.includes(capability)"), 'Organization-wide Super Admin fallback must still enforce the governed role capability allowlist.')
expect(authorize.includes(".eq('organization_id', organizationId)"), 'Organization-wide Super Admin authority must remain constrained to the governed organization boundary.')
expect(authorize.includes(".in('project_id', projectIds)"), 'Organization-wide Super Admin bindings must be resolved only from projects inside the governed organization.')
expect(authorize.includes(".eq('active', true)"), 'Organization-wide Super Admin authority must require an active role binding.')
expect(authorize.includes('binding.expires_at'), 'Organization-wide Super Admin authority must respect binding expiry.')
expect(resourceAuthorization.includes("rpc('can_view_dataset_resource'"), 'Dataset resource ACL must remain the primary visibility decision.')
expect(resourceAuthorization.includes('if (data === true) return true'), 'Existing positive resource ACL decisions must remain authoritative.')
expect(resourceAuthorization.includes('assertProjectBelongsToInstanceOrganization'), 'Super Admin dataset fallback must prove the dataset project belongs to the governed instance organization.')
expect(resourceAuthorization.includes('hasOrganizationWideDataGovernanceSuperAdminCapability'), 'Dataset visibility must honor organization-wide Data Governance Super Admin authority after ACL denial.')
expect(resourceAuthorization.includes("'catalog.read'"), 'Dataset visibility fallback must require the explicit catalog.read capability.')
expect(profilingRun.includes('canViewDatasetResource(user.id, dataset.id)'), 'Profiling admission must continue to enforce governed dataset visibility rather than bypassing the resource gate.')
expect(cleanup.includes('authorizeDataGovernanceSuperAdmin(user.id, target.projectId)'), 'Destructive cleanup must authorize the exact Super Admin role on the server.')
expect(cleanup.includes("confirmation !== target.name"), 'Permanent delete must require exact-name confirmation.')
expect(cleanup.includes('preflightDelete(targetKind, id, target.projectId, superAdminContext.organizationId)'), 'Permanent delete must run governed dependency preflight.')
expect(cleanup.includes("active orchestration job(s)"), 'Permanent delete must refuse active orchestration dependencies.')
expect(cleanup.includes("immutable governance risk event(s)"), 'Dataset deletion must preserve immutable governance evidence.')
expect(cleanup.includes('last active Data Governance Admin binding'), 'Project cleanup must protect the last Super Admin authority in the organization.')
expect(consoleUi.includes('Permanent delete is exclusive to Data Governance Admin'), 'UI must explain exclusive delete authority.')
expect(consoleUi.includes('external database/catalog/schema objects'), 'UI must distinguish external native hierarchy from DataNexus-owned folders.')
expect(migration.includes("'catalog.delete','source.delete','project.delete'"), 'Super Admin migration must add explicit destructive capabilities.')
expect(migration.includes("'admin.manage'"), 'Super Admin migration must include platform administration capability.')
expect(migration.includes("p_capability <> all(array['catalog.delete','source.delete','project.delete']"), 'Organization OWNER/ADMIN must not inherit destructive capabilities through the generic capability shortcut.')
expect(createProject.includes('authorizeDataGovernanceSuperAdminForOrganization'), 'Super Admin must be able to create projects inside its governed organization boundary.')

if (!process.exitCode) console.log('Data Governance Super Admin cleanup and resource-access contract passed.')
