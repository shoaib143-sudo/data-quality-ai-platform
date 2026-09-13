import fs from 'node:fs'

const glossaryPage = fs.readFileSync('app/glossary/page.tsx', 'utf8')
const glossaryManager = fs.readFileSync('app/glossary/glossary-manager.tsx', 'utf8')
const datasetPage = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')
const profilingRun = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const readiness = fs.readFileSync('app/api/profiling/readiness/route.ts', 'utf8')
const readinessRemediate = fs.readFileSync('app/api/profiling/readiness/remediate/route.ts', 'utf8')
const profilingExplorer = fs.readFileSync('app/profiling/explorer/page.tsx', 'utf8')
const profilingGovernancePanel = fs.readFileSync('app/profiling/profiling-governance-panel.tsx', 'utf8')
const profilingApproval = fs.readFileSync('app/api/profiling/approval/route.ts', 'utf8')
const profilingRemediation = fs.readFileSync('app/api/profiling/remediation/route.ts', 'utf8')
const profilingReprofile = fs.readFileSync('app/api/profiling/remediation/reprofile/route.ts', 'utf8')
const profilingVerify = fs.readFileSync('app/api/profiling/remediation/verify/route.ts', 'utf8')

const checks = [
  ['glossary server resolves glossary.manage', glossaryPage.includes("hasProjectCapability") && glossaryPage.includes("'glossary.manage'")],
  ['glossary passes manageable project ids', glossaryPage.includes('manageableProjectIds={manageableProjectIds}')],
  ['glossary create form is capability gated', glossaryManager.includes('canManageSelectedProject ? <form')],
  ['glossary term mutations are capability gated', glossaryManager.includes('manageableProjects.has(item.project_id) ? <div')],
  ['glossary mapping proposal is capability gated', glossaryManager.includes('manageableProjects.has(item.project_id) ? <MappingForm')],
  ['dataset detail resolves profiling.execute', datasetPage.includes("hasProjectCapability") && datasetPage.includes("'profiling.execute'")],
  ['dataset actions require execution authority in UI', datasetPage.includes('canExecuteProfiling&&version?<section')],
  ['profiling execution API requires profiling.execute', profilingRun.includes("authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')")],
  ['profiling readiness API requires profiling.execute', readiness.includes("authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')")],
  ['profiling readiness remediation requires profiling.execute', readinessRemediate.includes("authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')")],
  ['profiling explorer resolves workflow.manage', profilingExplorer.includes("hasProjectCapability(user.id, projectId, 'workflow.manage')")],
  ['profiling explorer resolves issues.manage', profilingExplorer.includes("hasProjectCapability(user.id, projectId, 'issues.manage')")],
  ['profiling explorer gates workflow navigation by workspace policy', profilingExplorer.includes("canAccessWorkspace(landing.persona, 'workflows', landing.organizationRole)")],
  ['profiling panel receives workflow capability', profilingGovernancePanel.includes('canManageWorkflow: boolean')],
  ['profiling panel receives remediation capability', profilingGovernancePanel.includes('canManageRemediation: boolean')],
  ['profiling panel gates approval action', profilingGovernancePanel.includes('const canStartApproval = canManageWorkflow &&')],
  ['profiling panel gates remediation action', profilingGovernancePanel.includes('const canTrackRemediation = canManageRemediation &&')],
  ['profiling panel gates manual verification', profilingGovernancePanel.includes('const canCheckVerification = canManageRemediation &&')],
  ['profiling panel gates verification retry', profilingGovernancePanel.includes('const canRetryVerification = canManageRemediation &&')],
  ['profiling panel gates issue resolution controls', profilingGovernancePanel.includes('!resolved && canManageRemediation')],
  ['profiling approval API requires workflow.manage', profilingApproval.includes("authorizeProject(user.id, dataset.project_id, 'workflow.manage')")],
  ['profiling remediation API requires issues.manage', profilingRemediation.includes("authorizeProject(user.id, instance.project_id, 'issues.manage')")],
  ['profiling reprofile API requires issues.manage', profilingReprofile.includes("authorizeProject(user.id, outcome.project_id, 'issues.manage')")],
  ['profiling verification API requires issues.manage', profilingVerify.includes("authorizeProject(user.id, instance.project_id, 'issues.manage')")],
  ['profiling verification API no longer accepts quality.read as mutation authority', !profilingVerify.includes("authorizeProject(user.id, instance.project_id, 'quality.read')")],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Persona mutation visibility verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log('PASS persona mutation visibility matches server authorization boundaries')
