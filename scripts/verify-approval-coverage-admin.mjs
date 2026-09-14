import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const service = read('lib/governance/approval-coverage-service.ts')
const panel = read('app/approvals/approval-coverage-panel.tsx')
const page = read('app/approvals/page.tsx')

requireText(service, "hasProjectCapability(userId, String(project.id), 'admin.manage')", 'Coverage must be limited to projects the user can administer.')
requireText(service, "['true', '1', 'yes'].includes(synthetic)", 'Synthetic bootstrap critical elements must not create real approval coverage scopes.')
requireText(service, "row.approval_axis === 'BUSINESS'", 'Coverage must evaluate the Business approval axis.')
requireText(service, "row.approval_axis === 'GOVERNANCE'", 'Coverage must evaluate the Governance approval axis.')
requireText(service, 'governanceRow.user_id !== businessRow.user_id', 'Coverage must require distinct users for separation of duties.')
requireText(service, "'MISSING_BUSINESS'", 'Coverage must expose missing Business approval.')
requireText(service, "'MISSING_GOVERNANCE'", 'Coverage must expose missing Governance approval.')
requireText(service, "'SEPARATION_BLOCKED'", 'Coverage must expose separation-of-duties failure.')
requireText(panel, 'Business approvers', 'Coverage UI must show Business approver identities.')
requireText(panel, 'Governance approvers', 'Coverage UI must show Governance approver identities.')
requireText(panel, 'Separation of duties', 'Coverage UI must expose separation-of-duties health.')
requireText(page, '<ApprovalCoveragePanel', 'Approvals workspace must expose the coverage administration panel.')

console.log('Approval coverage administration contract verified.')
