import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function personaSlugs() {
  const source = readFileSync('lib/governance/personas.ts', 'utf8')
  const marker = 'export const personaSlugs = ['
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('Unable to locate persona registry.')
  const tail = source.slice(start + marker.length)
  const end = tail.indexOf('] as const')
  if (end < 0) throw new Error('Unable to locate persona registry terminator.')
  const slugs = [...tail.slice(0, end).matchAll(/'([^']+)'/g)].map(row => row[1])
  if (slugs.length !== 13 || new Set(slugs).size !== 13) {
    throw new Error(`Expected exactly 13 unique personas, found ${slugs.length}.`)
  }
  return slugs
}

function personaReadRoutes(slug) {
  const source = readFileSync('lib/governance/persona-acceptance-tasks.ts', 'utf8')
  const marker = `  '${slug}': [`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`Acceptance tasks missing persona ${slug}.`)
  const tail = source.slice(start + marker.length)
  const end = tail.indexOf('\n  ],')
  if (end < 0) throw new Error(`Acceptance tasks for ${slug} are malformed.`)
  const block = tail.slice(0, end)
  return [...block.matchAll(/\{[^{}]*route: '([^']+)'[^{}]*mode: 'READ'[^{}]*\}/g)]
    .map(row => row[1])
}

function expectedRoleKey(slug) {
  return slug.toUpperCase().replaceAll('-', '_')
}

async function allUsers(admin) {
  const users = []
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to list test principals: ${error.message}`)
    users.push(...(data?.users ?? []))
    if ((data?.users ?? []).length < 1000) break
  }
  return users
}

async function sessionCookies({ url, key, email }) {
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError) throw new Error(`Unable to create one-time test sign-in for persona: ${linkError.message}`)
  const tokenHash = linkData?.properties?.hashed_token
  if (!tokenHash) throw new Error('Supabase did not return a hashed one-time token.')

  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (verifyError || !verified?.session?.access_token || !verified.session.refresh_token) {
    throw new Error(`Unable to verify one-time test sign-in: ${verifyError?.message ?? 'session missing'}`)
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
  if (setError) throw new Error(`Unable to serialize browser session cookies: ${setError.message}`)
  if (!pending.length) throw new Error('Supabase SSR did not produce browser session cookies.')
  return pending
}

function toPlaywrightCookies(cookies, baseUrl) {
  const hostname = new URL(baseUrl).hostname
  return cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.options?.domain ?? hostname,
    path: cookie.options?.path ?? '/',
    httpOnly: cookie.options?.httpOnly ?? false,
    secure: cookie.options?.secure ?? true,
    sameSite: cookie.options?.sameSite === 'strict'
      ? 'Strict'
      : cookie.options?.sameSite === 'none'
        ? 'None'
        : 'Lax',
    ...(typeof cookie.options?.maxAge === 'number'
      ? { expires: Math.floor(Date.now() / 1000) + cookie.options.maxAge }
      : {}),
  }))
}

async function browserEvidence({ browser, baseUrl, slug, cookies, readRoutes }) {
  const context = await browser.newContext()
  try {
    await context.addCookies(toPlaywrightCookies(cookies, baseUrl))
    const page = await context.newPage()
    const results = []
    const targets = [`/home/${slug}`, ...readRoutes]
    for (const target of targets) {
      const requested = new URL(target, baseUrl)
      const response = await page.goto(requested.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
      const finalUrl = new URL(page.url())
      const bodyText = await page.locator('body').innerText().catch(() => '')
      const heading = (await page.locator('h1').first().innerText().catch(() => '')).trim()
      const passed = finalUrl.origin === new URL(baseUrl).origin
        && finalUrl.pathname !== '/login'
        && !finalUrl.pathname.startsWith('/login/')
        && (response?.status() ?? 500) < 400
        && !/Application error|Authentication could not be completed/i.test(bodyText)
        && (target !== `/home/${slug}` || finalUrl.pathname === `/home/${slug}`)
      results.push({
        requestedPath: requested.pathname + requested.search,
        finalPath: finalUrl.pathname + finalUrl.search,
        httpStatus: response?.status() ?? null,
        heading,
        passed,
      })
      if (!passed) break
    }
    return results
  } finally {
    await context.close()
  }
}

async function main() {
  const supabaseUrl = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const baseUrl = required(process.env.DATANEXUS_BASE_URL, 'DATANEXUS_BASE_URL').replace(/\/$/, '')
  const projectId = required(process.env.PERSONA_PROJECT_ID, 'PERSONA_PROJECT_ID')
  const evidencePath = process.env.PERSONA_EVIDENCE_PATH?.trim() || ''
  const slugs = personaSlugs()

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const users = await allUsers(admin)
  const principals = users.filter(user => typeof user.email === 'string' && user.email.endsWith('@datanexus.test'))
  const byEmail = new Map(principals.map(user => [user.email.toLowerCase(), user]))

  const { data: project, error: projectError } = await admin.schema('app').from('projects')
    .select('id,organization_id,name').eq('id', projectId).maybeSingle()
  if (projectError || !project?.organization_id) throw new Error('Persona test project could not be resolved.')

  const principalIds = slugs.map(slug => byEmail.get(`persona.${slug}@datanexus.test`)?.id).filter(Boolean)
  if (principalIds.length !== 13) throw new Error(`Expected 13 real persona principals, found ${principalIds.length}.`)

  const [{ data: bindings, error: bindingsError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin.schema('governance').from('project_role_bindings')
      .select('user_id,role_key,active,expires_at')
      .eq('project_id', projectId).eq('active', true).in('user_id', principalIds),
    admin.schema('app').from('organization_members')
      .select('user_id,role').eq('organization_id', project.organization_id).in('user_id', principalIds),
  ])
  if (bindingsError) throw new Error(`Unable to verify persona project bindings: ${bindingsError.message}`)
  if (membershipsError) throw new Error(`Unable to verify persona organization memberships: ${membershipsError.message}`)

  const browser = await chromium.launch({ headless: true })
  const personaEvidence = []
  try {
    for (const slug of slugs) {
      const email = `persona.${slug}@datanexus.test`
      const user = byEmail.get(email)
      if (!user) throw new Error(`Missing real test principal for ${slug}.`)
      const userBindings = (bindings ?? []).filter(row => row.user_id === user.id)
      if (userBindings.length !== 1 || String(userBindings[0].role_key) !== expectedRoleKey(slug)) {
        throw new Error(`Persona ${slug} does not have exactly one expected active project-role binding.`)
      }
      if (!(memberships ?? []).some(row => row.user_id === user.id)) {
        throw new Error(`Persona ${slug} is not an organization member.`)
      }

      const cookies = await sessionCookies({ url: supabaseUrl, key: serviceRoleKey, email })
      const readRoutes = personaReadRoutes(slug)
      const routes = await browserEvidence({ browser, baseUrl, slug, cookies, readRoutes })
      personaEvidence.push({
        persona: slug,
        expectedRoleKey: expectedRoleKey(slug),
        authenticatedLandingPassed: routes[0]?.passed === true,
        readRouteCount: readRoutes.length,
        readRoutesPassed: routes.filter((row, index) => index > 0 && row.passed).length,
        routes,
      })
      if (routes.some(row => !row.passed)) break
    }
  } finally {
    await browser.close()
  }

  const failed = personaEvidence.filter(item =>
    !item.authenticatedLandingPassed || item.readRoutesPassed !== item.readRouteCount
  )
  const evidence = {
    evidenceKind: 'DATANEXUS_13_PERSONA_LIVE_BROWSER_ACCEPTANCE',
    status: personaEvidence.length === 13 && failed.length === 0 ? 'PASS' : 'BLOCKED',
    baseUrl,
    projectId,
    projectName: project.name,
    personaCountExpected: 13,
    personaCountExecuted: personaEvidence.length,
    failedPersonas: failed.map(item => item.persona),
    personas: personaEvidence,
    safeguards: {
      passwordsStored: false,
      sessionTokensRecorded: false,
      mutationTasksExecuted: false,
      testMode: 'READ_ONLY_BROWSER',
    },
    generatedAt: new Date().toISOString(),
  }

  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true })
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
  }
  console.log(JSON.stringify({
    status: evidence.status,
    personaCountExecuted: evidence.personaCountExecuted,
    failedPersonas: evidence.failedPersonas,
    safeguards: evidence.safeguards,
  }))
  if (evidence.status !== 'PASS') process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
