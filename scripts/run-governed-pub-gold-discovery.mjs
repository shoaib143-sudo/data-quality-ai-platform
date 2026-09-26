import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const PROJECT_ID = '479813aa-72a4-4b12-b72a-74da8d2419ce'
const SOURCE_ID = 'f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b'
const PERSONA_EMAIL = 'persona.data-governance-admin@datanexus.test'
const DGA_BINDING_ID = '5b08b426-5578-4c39-b2f2-adf85f855927'

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

async function sessionCookies({ url, key, email }) {
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkError) throw new Error(`Unable to create one-time persona sign-in: ${linkError.message}`)
  const tokenHash = linkData?.properties?.hashed_token
  if (!tokenHash) throw new Error('Supabase did not return a hashed one-time token.')

  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (verifyError || !verified?.session?.access_token || !verified.session.refresh_token) {
    throw new Error(`Unable to verify one-time persona sign-in: ${verifyError?.message ?? 'session missing'}`)
  }

  const pending = []
  const ssr = createServerClient(url, key, {
    cookies: {
      getAll() { return [] },
      setAll(cookies) { pending.push(...cookies) },
    },
  })
  const { error: setError } = await ssr.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  })
  if (setError) throw new Error(`Unable to serialize persona session: ${setError.message}`)
  if (!pending.length) throw new Error('Supabase SSR did not produce session cookies.')
  return pending
}

function cookieHeader(cookies) {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
}

async function deactivateBinding(admin) {
  if (!admin) return
  const { error } = await admin.schema('governance').from('project_role_bindings')
    .update({ active: false, expires_at: new Date().toISOString() })
    .eq('id', DGA_BINDING_ID).eq('project_id', PROJECT_ID)
  if (error) console.error('Temporary DGA binding cleanup failed.')
}

async function main() {
  const supabaseUrl = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const baseUrl = required(process.env.DATANEXUS_BASE_URL, 'DATANEXUS_BASE_URL').replace(/\/$/, '')
  const evidencePath = process.env.DISCOVERY_EVIDENCE_PATH?.trim() || 'artifacts/pub-gold-discovery.json'
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let bindingActivated = false

  try {
    const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources')
      .select('id,project_id,status').eq('id', SOURCE_ID).maybeSingle()
    if (sourceError || !source) throw new Error('PUB Gold source could not be resolved.')
    if (source.project_id !== PROJECT_ID) throw new Error('PUB Gold source project boundary mismatch.')
    if (source.status !== 'CONFIGURED') throw new Error(`PUB Gold source is not CONFIGURED: ${source.status}`)

    const { data: scope, error: scopeError } = await admin.schema('catalog').from('source_scopes')
      .select('id,current_version_id,status').eq('project_id', PROJECT_ID).eq('source_id', SOURCE_ID)
      .eq('status', 'ACTIVE').maybeSingle()
    if (scopeError || !scope?.current_version_id) throw new Error('An active governed source scope is required.')

    const { data: scopeVersion, error: scopeVersionError } = await admin.schema('catalog').from('source_scope_versions')
      .select('id,project_id,source_id,version_number,scope_mode,native_selection,scope_hash')
      .eq('id', scope.current_version_id).maybeSingle()
    if (scopeVersionError || !scopeVersion) throw new Error('Current governed source scope version could not be resolved.')
    if (scopeVersion.project_id !== PROJECT_ID || scopeVersion.source_id !== SOURCE_ID) {
      throw new Error('Current governed source scope version boundary mismatch.')
    }

    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) throw new Error('Unable to resolve DGA persona.')
    const persona = users?.users?.find((user) => user.email?.toLowerCase() === PERSONA_EMAIL)
    if (!persona) throw new Error('DGA persona principal was not found.')

    const temporaryExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString()
    const { error: activateError } = await admin.schema('governance').from('project_role_bindings')
      .update({ active: true, expires_at: temporaryExpiry })
      .eq('id', DGA_BINDING_ID).eq('project_id', PROJECT_ID).eq('user_id', persona.id)
    if (activateError) throw new Error('Unable to activate temporary exact-project DGA binding.')
    bindingActivated = true

    const { data: binding, error: bindingError } = await admin.schema('governance').from('project_role_bindings')
      .select('id,role_key,active,expires_at').eq('project_id', PROJECT_ID).eq('user_id', persona.id)
      .eq('role_key', 'DATA_GOVERNANCE_ADMIN').eq('active', true).maybeSingle()
    if (bindingError || !binding) throw new Error('Active exact-project DGA binding is required.')
    if (binding.expires_at && new Date(binding.expires_at).getTime() <= Date.now()) throw new Error('Exact-project DGA binding has expired.')

    const { data: allowed, error: capabilityError } = await admin.schema('governance').rpc('has_project_capability', {
      p_project_id: PROJECT_ID,
      p_user_id: persona.id,
      p_capability: 'discovery.execute',
    })
    if (capabilityError) throw new Error(`Unable to verify discovery.execute: ${capabilityError.message}`)
    if (allowed !== true) throw new Error('DGA persona does not currently have discovery.execute.')

    const cookies = await sessionCookies({ url: supabaseUrl, key: serviceRoleKey, email: PERSONA_EMAIL })
    const idempotencyKey = `pub-gold-controlled-${scopeVersion.id}`
    const response = await fetch(`${baseUrl}/api/catalog/discovery`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': cookieHeader(cookies),
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ sourceId: SOURCE_ID }),
      redirect: 'manual',
    })
    const responseBody = await response.json().catch(() => ({}))
    if (response.status !== 202 || responseBody?.accepted !== true || responseBody?.sourceId !== SOURCE_ID) {
      throw new Error(`Discovery API rejected controlled request with HTTP ${response.status}: ${String(responseBody?.error ?? 'unexpected response').slice(0, 300)}`)
    }

    const evidence = {
      evidenceKind: 'DATANEXUS_PUB_GOLD_CONTROLLED_DISCOVERY',
      status: 'ACCEPTED',
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      scopeVersionId: scopeVersion.id,
      scopeVersionNumber: scopeVersion.version_number,
      scopeMode: scopeVersion.scope_mode,
      scopeHash: scopeVersion.scope_hash,
      nativeSelection: scopeVersion.native_selection,
      persona: 'data-governance-admin',
      durableJobId: responseBody.durableJobId ?? null,
      durableJobStatus: responseBody.status ?? null,
      alreadyActive: responseBody.alreadyActive === true,
      generatedAt: new Date().toISOString(),
      safeguards: {
        exactProjectOnly: true,
        exactSourceOnly: true,
        currentGovernedScopeOnly: true,
        scopeAgnosticDiscovery: true,
        mutationType: 'DISCOVERY_ONLY',
        registrationPerformed: false,
        profilingPerformed: false,
        lineageMutationPerformed: false,
        passwordsStored: false,
        sessionTokensRecorded: false,
      },
    }
    mkdirSync(dirname(evidencePath), { recursive: true })
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({
      status: evidence.status,
      scopeVersionId: evidence.scopeVersionId,
      scopeVersionNumber: evidence.scopeVersionNumber,
      durableJobId: evidence.durableJobId,
      alreadyActive: evidence.alreadyActive,
      safeguards: evidence.safeguards,
    }))
  } finally {
    if (bindingActivated) await deactivateBinding(admin)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
