import fs from 'node:fs'
import path from 'node:path'
import { personas, personaSlugs } from '../lib/governance/personas.ts'
import {
  canAccessWorkspace,
  canAccessWorkspaceHref,
  workspaceForHref,
  workspacePrefixes,
} from '../lib/governance/workspace-policy.ts'

const checks = []
function check(name, passed) { checks.push([name, Boolean(passed)]) }

function pageFiles(root = 'app') {
  const pages = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) pages.push(...pageFiles(absolute))
    else if (entry.isFile() && entry.name === 'page.tsx') pages.push(absolute.split(path.sep).join('/'))
  }
  return pages.sort()
}

function routeForPage(file) {
  const relative = file.replace(/^app\//, '').replace(/\/page\.tsx$/, '')
  if (!relative) return '/'
  return `/${relative.replace(/\([^/]+\)\//g, '').replace(/\[(\.\.\.)?[^\]]+\]/g, ':param')}`
}

function ancestorLayouts(file) {
  const layouts = []
  let dir = path.dirname(file)
  while (dir === 'app' || dir.startsWith(`app${path.sep}`)) {
    const layout = path.join(dir, 'layout.tsx')
    if (fs.existsSync(layout)) layouts.push(layout)
    if (dir === 'app') break
    dir = path.dirname(dir)
  }
  return layouts
}

check('exactly 13 supported governance personas', personaSlugs.length === 13)
check('persona definitions match persona slug catalog', Object.keys(personas).length === personaSlugs.length && personaSlugs.every(slug => personas[slug]))

for (const slug of personaSlugs) {
  const persona = personas[slug]
  for (const item of persona.nav) {
    check(`${slug} navigation is authorized: ${item.href}`, canAccessWorkspaceHref(slug, item.href, null))
  }
}

check('dashboard remains Data Governance Admin only', personaSlugs.every(slug => canAccessWorkspace(slug, 'dashboard') === (slug === 'data-governance-admin')))
check('platform controls remain Data Governance Admin only', personaSlugs.every(slug => canAccessWorkspace(slug, 'platform') === (slug === 'data-governance-admin')))
check('organization admin is not granted by governance persona alone', personaSlugs.every(slug => !canAccessWorkspace(slug, 'admin', null)))
check('workspace prefixes are unique', new Set(workspacePrefixes.map(([prefix]) => prefix)).size === workspacePrefixes.length)

const explicitlyNonWorkspaceRoutes = [
  '/', '/login', '/forgot-password', '/reset-password', '/home', '/home/:param', '/home/unavailable',
  '/ai-insights',
]

for (const file of pageFiles()) {
  const route = routeForPage(file)
  if (explicitlyNonWorkspaceRoutes.some(prefix => route === prefix || (prefix.endsWith('/:param') && route.startsWith(prefix.slice(0, -6))))) continue
  if (route.startsWith('/admin')) {
    const layouts = ancestorLayouts(file)
    check(`${route} is protected by organization admin layout`, layouts.some(layout => fs.readFileSync(layout, 'utf8').includes('requireOrganizationAdminAccess')))
    continue
  }

  const workspace = workspaceForHref(route)
  check(`${route} maps to an explicit workspace`, Boolean(workspace))
  if (!workspace) continue
  const layouts = ancestorLayouts(file)
  check(
    `${route} has ${workspace} route guard`,
    layouts.some(layout => fs.readFileSync(layout, 'utf8').includes(`requireWorkspaceAccess('${workspace}')`)),
  )
}

const landing = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')
check('shared landing imports centralized href authorization', landing.includes('canAccessWorkspaceHref'))
check('shared landing resolves unsafe destinations through safeHref', landing.includes('const safeHref ='))
check('shared landing filters persona nav with workspace policy', landing.includes('persona.nav.filter(item => canAccessWorkspaceHref'))

const recent = fs.readFileSync('components/governance/landing-recently-viewed.tsx', 'utf8')
check('recently viewed is scoped to active persona', recent.includes('persona: string') && recent.includes('item.persona === persona'))

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Persona workspace policy verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`PASS persona workspace policy (${personaSlugs.length} personas, ${pageFiles().length} UI pages checked)`)
