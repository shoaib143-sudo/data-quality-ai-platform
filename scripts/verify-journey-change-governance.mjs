import fs from 'node:fs'

const service = fs.readFileSync('lib/governance/lineage-change-governance.ts', 'utf8')
const baseImpact = fs.readFileSync('lib/governance/lineage-change-impact.ts', 'utf8')
const gate = fs.readFileSync('lib/governance/lineage-change-gate.ts', 'utf8')
const route = fs.readFileSync('app/api/lineage/change-impact/route.ts', 'utf8')
const impactRoute = fs.readFileSync('app/api/lineage/impact/route.ts', 'utf8')
const fixture = JSON.parse(fs.readFileSync('fixtures/reference-estate/customer-orders-payments-v0.json', 'utf8'))

const checks = [
  ['governance assessment reuses existing lineage impact engine', service.includes('assessProposedLineageChange')],
  ['base impact remains bounded by depth and edge limits', baseImpact.includes('Math.min(4') && baseImpact.includes('Math.min(300')],
  ['base impact treats missing lineage as unknown rather than safe', baseImpact.includes('Absence of lineage evidence is not proof of no impact')],
  ['governance enrichment resolves downstream field assets to datasets', service.includes("from('lineage_assets')") && service.includes('columnAssetIds')],
  ['governance enrichment is project scoped', ["from('dataset_catalog')", "from('cde_mappings')", "from('quality_rule_definitions')", "from('data_contracts')", "from('stewardship_assignments')", "from('certification_readiness')", "from('control_scope_bindings')"].every((token) => service.includes(token)) && service.includes(".eq('project_id', input.projectId)" )],
  ['CDE impact separates authoritative and proposed mappings', service.includes('authoritativeCdeImpact') && service.includes('proposedCdeImpact')],
  ['DQ impact only treats enabled approved rules as authoritative', service.includes("rule.enabled === true") && service.includes("upper(rule.approval_status) === 'APPROVED'")],
  ['control impact requires approved active authority', service.includes("upper(control.lifecycle_status) === 'ACTIVE'") && service.includes("upper(control.review_status) === 'APPROVED'") && service.includes("upper(control.authority_class) !== 'UNVERIFIED'")],
  ['limited lineage forces review', service.includes('LINEAGE_SCOPE_LIMITED')],
  ['missing lineage evidence forces review', service.includes('LINEAGE_EVIDENCE_INCOMPLETE')],
  ['certified dataset impact forces approval', service.includes('CERTIFIED_DATASET_IMPACT')],
  ['critical CDE impact forces approval', service.includes('CRITICAL_CDE_IMPACT')],
  ['structural contract impact forces approval', service.includes('CONTRACT_REVIEW_REQUIRED')],
  ['high severity DQ controls are surfaced', service.includes('HIGH_SEVERITY_DQ_CONTROL_IMPACT')],
  ['missing stewardship is surfaced', service.includes('IMPACT_OWNER_GAP')],
  ['enriched decision is persisted into proposed_change evidence', service.includes("proposed_change: { ...proposedChange, decision, approval_required: requiresApproval }")],
  ['existing gate consumes persisted proposed_change decision', gate.includes('evidence.proposed_change') && gate.includes('approval_required')],
  ['governance enrichment emits audit evidence', service.includes('LINEAGE_CHANGE_GOVERNANCE_IMPACT_ASSESSED')],
  ['change assessment never claims production mutation', service.includes('productionMutationPerformed: false') && service.includes('production_mutation_performed: false')],
  ['change-impact API uses API-safe auth', route.includes('requireApiUser') && !route.includes('requireUser()')],
  ['change-impact API authorizes lineage.read before assessment', /authorizeProject\(user\.id, projectId, 'lineage\.read'\)[\s\S]*assessGovernedLineageChange/.test(route)],
  ['existing lineage impact API also uses API-safe auth', impactRoute.includes('requireApiUser') && !impactRoute.includes('requireUser()')],
  ['reference estate includes governed type-change scenario', fixture.scenarios.some((scenario) => scenario.key === 'customer-id-type-change' && scenario.expectedSignals.includes('FIELD_LINEAGE_IMPACT') && scenario.expectedSignals.includes('CONTRACT_IMPACT'))],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Change governance journey verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Change governance journey verification passed (${checks.length} checks).`)
