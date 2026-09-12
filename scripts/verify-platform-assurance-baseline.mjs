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
const supabaseExceptions = fs.readFileSync('docs/platform-assurance/supabase-security-exceptions.md', 'utf8')
const incidentDoc = fs.readFileSync('docs/security-incident-response.md', 'utf8')
const timeoutMigration = fs.readFileSync('supabase/migrations/20260912054000_native_interrupt_timeout_lifecycle.sql', 'utf8')
const interruptAuthorizationMigration = fs.readFileSync('supabase/migrations/20260912054005_harden_runtime_interrupt_authorization_order.sql', 'utf8')

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
}
if (!supabaseEnv.includes('NEXT_PUBLIC_SUPABASE_URL') || !supabaseEnv.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) fail('Browser Supabase configuration must use explicit public environment variables.')
if (!supabaseAdmin.includes('SUPABASE_SERVICE_ROLE_KEY') || supabaseAdmin.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) fail('Service-role credential must remain server-only.')
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

if (migrationAliases.policy !== 'DO_NOT_REWRITE_PRODUCTION_HISTORY') fail('Migration alias policy must remain forward-only.')
const interruptAuthAlias = (migrationAliases.aliases ?? []).find(item => item.logicalName === 'harden_runtime_interrupt_authorization_order')
if (interruptAuthAlias?.repositoryVersion !== '20260912054005' || interruptAuthAlias?.observedProductionVersion !== '20260912053907') fail('Runtime interrupt hardening migration alias must match verified repository and production versions.')

console.log(`Platform assurance baseline verified: ${controls.length} controls, ${runtime.configurations.length} explicit runtime settings, ${incident.requiredPhases.length} incident phases.`)
