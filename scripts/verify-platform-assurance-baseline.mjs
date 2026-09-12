import fs from 'node:fs'
import path from 'node:path'

const fail = (message) => { throw new Error(message) }
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const exists = (file) => fs.existsSync(path.resolve(file))

const controlMap = readJson('infra/platform-assurance/control-map.json')
const incident = readJson('infra/platform-assurance/security-incident-response.json')
const runtime = readJson('infra/platform-assurance/runtime-config-contract.json')
const manifest = readJson('infra/recovery/platform-manifest.json')
const migrationAliases = readJson('infra/recovery/migration-history-aliases.json')
const supabaseEnv = fs.readFileSync('lib/supabase/env.ts', 'utf8')
const supabaseAdmin = fs.readFileSync('lib/supabase/admin.ts', 'utf8')
const externalReadiness = fs.readFileSync('lib/observability/external-integration-readiness.ts', 'utf8')
const supabaseExceptions = fs.readFileSync('docs/platform-assurance/supabase-security-exceptions.md', 'utf8')
const incidentDoc = fs.readFileSync('docs/security-incident-response.md', 'utf8')
const timeoutMigration = fs.readFileSync('supabase/migrations/20260912054000_native_interrupt_timeout_lifecycle.sql', 'utf8')
const interruptAuthorizationMigration = fs.readFileSync('supabase/migrations/20260912054005_harden_runtime_interrupt_authorization_order.sql', 'utf8')
const certificationRuntimeMigration = fs.readFileSync('supabase/migrations/20260912054927_reconcile_certification_membership_runtime.sql', 'utf8')
const certificationSnapshotSchema = fs.readFileSync('supabase/migrations/20260912055356_reconcile_certification_prior_snapshot_schema.sql', 'utf8')

if (controlMap.schemaVersion !== 1 || controlMap.frameworkAlignmentOnly !== true) fail('Control map must be versioned and explicitly alignment-only.')
const controls = controlMap.controls ?? []
if (controls.length < 12) fail('Platform assurance control map must cover the baseline control set.')
const ids = controls.map(control => control.id)
if (new Set(ids).size !== ids.length) fail('Platform assurance control IDs must be unique.')
for (const expected of Array.from({ length: 12 }, (_, i) => `PA-${String(i + 1).padStart(3, '0')}`)) {
  if (!ids.includes(expected)) fail(`Missing required platform assurance control ${expected}.`)
}
for (const control of controls) {
  if (!['R0','R1','R2','R3'].includes(control.riskTier)) fail(`Invalid risk tier for ${control.id}.`)
  if (!Array.isArray(control.evidence) || control.evidence.length === 0) fail(`Control ${control.id} must declare evidence.`)
  for (const evidence of control.evidence) if (!exists(evidence)) fail(`Control ${control.id} evidence path is missing: ${evidence}`)
}
const immutableCiControl = controls.find(control => control.id === 'PA-002')
if (immutableCiControl?.state !== 'ENFORCED') fail('PA-002 immutable CI action references must remain ENFORCED.')
for (const evidence of ['scripts/verify-workflow-action-pinning.mjs', 'scripts/test-workflow-action-pinning.mjs']) {
  if (!immutableCiControl?.evidence?.includes(evidence)) fail(`PA-002 must retain evidence: ${evidence}`)
}

const requiredPhases = ['DETECT','CLASSIFY','CONTAIN','PRESERVE_EVIDENCE','ERADICATE','RECOVER','COMMUNICATE','POST_INCIDENT_REVIEW','CONTROL_UPDATE']
if (JSON.stringify(incident.requiredPhases) !== JSON.stringify(requiredPhases)) fail('Security incident phases must remain ordered and complete.')
if (incident.invariants?.evidenceIsAppendOnly !== true) fail('Security incident evidence must be append-only in intent.')
if (incident.invariants?.secretValuesForbiddenInEvidence !== true) fail('Security incident evidence must forbid secret values.')
if (!incidentDoc.includes('PRESERVE_EVIDENCE') || !incidentDoc.includes('CONTROL_UPDATE')) fail('Human incident-response contract must cover evidence preservation and control updates.')

if (runtime.secretValuesAllowed !== false) fail('Runtime configuration contract must forbid secret values.')
if (runtime.topologyAuthority !== 'infra/recovery/platform-manifest.json') fail('Recovery platform manifest must remain topology authority.')
if (runtime.configurations.some(item => Object.hasOwn(item, 'value') || Object.hasOwn(item, 'secretValue'))) fail('Runtime configuration inventory must never contain values.')
for (const item of runtime.configurations) {
  if (!item.name || !item.classification || !item.authority || !item.failureMode || !item.evidence) fail(`Runtime configuration entry is incomplete: ${item.name ?? 'unknown'}`)
  if (!exists(item.evidence)) fail(`Runtime configuration evidence path is missing: ${item.evidence}`)
  if (item.classification.startsWith('SECRET_') && item.browserExposureForbidden !== true) fail(`Secret runtime configuration must explicitly forbid browser exposure: ${item.name}`)
}
const requiredRuntimeConfigNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'POLICY_DECISION_PROVIDER',
  'OPA_URL',
  'OPA_DECISION_PATH',
  'OPA_AUTH_TOKEN',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_HEADERS',
]
const runtimeConfigNames = new Set(runtime.configurations.map(item => item.name))
for (const name of requiredRuntimeConfigNames) if (!runtimeConfigNames.has(name)) fail(`Runtime configuration inventory is missing ${name}.`)
if (!supabaseEnv.includes('NEXT_PUBLIC_SUPABASE_URL') || !supabaseEnv.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) fail('Browser Supabase configuration must use explicit public environment variables.')
if (!supabaseAdmin.includes('SUPABASE_SERVICE_ROLE_KEY') || supabaseAdmin.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) fail('Service-role credential must remain server-only.')
for (const name of ['POLICY_DECISION_PROVIDER','OPA_URL','OPA_DECISION_PATH','OPA_AUTH_TOKEN','OTEL_EXPORTER_OTLP_ENDPOINT','OTEL_EXPORTER_OTLP_HEADERS']) {
  if (!externalReadiness.includes(`process.env.${name}`)) fail(`Runtime configuration inventory entry is not consumed by readiness code: ${name}`)
}
if (!manifest.secretPolicy || manifest.secretPolicy.storeSecretValuesInRepository !== false) fail('Recovery topology must prohibit repository secret values.')

for (const marker of ['ACCEPTED LOCKED-TABLE POSTURE', 'INTENTIONAL PRIVILEGED AUTHORIZATION HELPERS', 'INTENTIONAL GOVERNED HUMAN-DECISION RPC', 'OPEN PLAN-CONSTRAINED SECURITY GAP']) {
  if (!supabaseExceptions.includes(marker)) fail(`Supabase advisor decision record is missing: ${marker}`)
}

if (!timeoutMigration.includes("REVOKE ALL ON FUNCTION agent.process_runtime_interrupt_timeout_internal(uuid,text) FROM public, anon, authenticated")) fail('Timeout automation must remain unavailable to authenticated clients.')
if (!timeoutMigration.includes("GRANT EXECUTE ON FUNCTION agent.process_runtime_interrupt_timeout_internal(uuid,text) TO service_role")) fail('Timeout automation must remain service-role governed.')
if (!timeoutMigration.includes("'LATE_DECISION_REJECTED'")) fail('Late human interrupt decisions must remain auditable.')
if (!/AND app_private\.is_project_admin\(r\.project_id\)[\s\S]*FOR UPDATE OF i/.test(interruptAuthorizationMigration)) fail('Human interrupt authorization must be evaluated before row locking.')
if (!interruptAuthorizationMigration.includes("RAISE EXCEPTION 'Agent runtime interrupt is unavailable'")) fail('Unknown and unauthorized interrupt identifiers must share a generic fail-closed response.')
if (interruptAuthorizationMigration.includes('Project administrator approval is required')) fail('Human interrupt RPC must not disclose a distinct authorization failure for a known interrupt.')
if (!interruptAuthorizationMigration.includes('REVOKE ALL ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) FROM public, anon, service_role')) fail('Human interrupt RPC must remain unavailable to anon and service automation.')
if (!interruptAuthorizationMigration.includes('GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) TO authenticated')) fail('Human interrupt RPC must remain authenticated-only.')

if (certificationRuntimeMigration.includes('om.is_active')) fail('Certification runtime must not reference the non-existent organization_members.is_active column.')
if (!certificationRuntimeMigration.includes('FROM app.organization_members om')) fail('Certification runtime must verify reviewer organization membership.')
if (!certificationRuntimeMigration.includes('prior_certification_status')) fail('Certification runtime must preserve prior certification state for cancellation.')
if (!certificationRuntimeMigration.includes('REVOKE ALL ON FUNCTION governance.request_dataset_certification')) fail('Certification request RPC must remain unavailable to client roles.')
if (!certificationRuntimeMigration.includes('GRANT EXECUTE ON FUNCTION governance.request_dataset_certification')) fail('Certification request RPC must remain service-role governed.')
for (const column of ['prior_certification_status', 'prior_certified_at', 'prior_certified_by']) {
  if (!certificationSnapshotSchema.includes(`ADD COLUMN IF NOT EXISTS ${column}`)) fail(`Certification reconstruction must restore ${column}.`)
}
if (!certificationSnapshotSchema.includes('certification_requests_prior_certification_status_check')) fail('Certification prior-state status constraint must be reconstruction-safe.')

if (migrationAliases.policy !== 'DO_NOT_REWRITE_PRODUCTION_HISTORY') fail('Migration alias policy must remain forward-only.')
const interruptAuthAlias = (migrationAliases.aliases ?? []).find(item => item.logicalName === 'harden_runtime_interrupt_authorization_order')
if (interruptAuthAlias?.repositoryVersion !== '20260912054005' || interruptAuthAlias?.observedProductionVersion !== '20260912053907') fail('Runtime interrupt hardening migration alias must match verified repository and production versions.')
const certificationAlias = (migrationAliases.aliases ?? []).find(item => item.logicalName === 'reconcile_certification_membership_runtime')
if (certificationAlias?.repositoryVersion !== '20260912054927' || certificationAlias?.observedProductionVersion !== '20260912055014') fail('Certification runtime reconciliation alias must match verified repository and production versions.')
const certificationSnapshotAlias = (migrationAliases.aliases ?? []).find(item => item.logicalName === 'reconcile_certification_prior_snapshot_schema')
if (certificationSnapshotAlias?.repositoryVersion !== '20260912055356' || certificationSnapshotAlias?.observedProductionVersion !== '20260912055419') fail('Certification snapshot schema reconciliation alias must match verified repository and production versions.')

console.log(`Platform assurance baseline verified: ${controls.length} controls, ${runtime.configurations.length} explicit runtime settings, ${incident.requiredPhases.length} incident phases.`)
