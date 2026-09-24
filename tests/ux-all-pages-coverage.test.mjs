import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const manifestPath = path.join(process.cwd(),'docs/ux/DATANEXUS-UX-ALL-PAGES-REVALIDATION.md')
const manifest = fs.readFileSync(manifestPath,'utf8')

function collectPages(dir) {
  const result = []
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,entry.name)
    if (entry.isDirectory()) result.push(...collectPages(full))
    else if (entry.name === 'page.tsx') result.push(path.relative(process.cwd(),full).split(path.sep).join('/'))
  }
  return result
}

test('every app page is explicitly covered by the UX revalidation manifest', () => {
  const pages = collectPages(path.join(process.cwd(),'app')).sort()
  assert.ok(pages.length > 0)
  const missing = pages.filter(page => !manifest.includes('`' + page + '`'))
  assert.deepEqual(missing,[],`UX manifest is missing page routes: ${missing.join(', ')}`)
  const documented = [...manifest.matchAll(/^\| `(app\/(?:[^`\n]+\/)?page\.tsx)` \|/gm)].map(match => match[1])
  const duplicates = documented.filter((route, index) => documented.indexOf(route) !== index)
  const stale = documented.filter(route => !pages.includes(route))
  assert.deepEqual(duplicates, [], `UX manifest contains duplicate routes: ${duplicates.join(', ')}`)
  assert.deepEqual(stale, [], `UX manifest contains stale or nonexistent routes: ${stale.join(', ')}`)
  assert.equal(documented.length, pages.length, 'UX manifest must enumerate every current route exactly once')
  assert.match(manifest,new RegExp('Total routes covered: \\*\\*' + pages.length + '\\*\\*'))
})

test('manifest records the shared modernized design constraints', () => {
  for (const marker of ['Inter','mild neomorphism','reduced dead space','progressive disclosure','Accessibility','object-centered 360']) {
    assert.ok(manifest.includes(marker),`Missing UX design marker: ${marker}`)
  }
})


test('all thirteen real DataNexus personas have route coverage and enforced landing boundaries', () => {
  const personaSource = fs.readFileSync(path.join(process.cwd(), 'lib/governance/personas.ts'), 'utf8')
  const acceptance = fs.readFileSync(path.join(process.cwd(), 'docs/ux/DUAL-ENVIRONMENT-ACCEPTANCE-MATRIX.md'), 'utf8')
  const slugList = personaSource.match(/export const personaSlugs = \[([\s\S]*?)\] as const/)
  assert.ok(slugList, 'Authoritative persona registry is required')
  const slugs = [...slugList[1].matchAll(/'([^']+)'/g)].map(match => match[1])
  assert.equal(slugs.length, 13, 'Current thirteen real personas must all be represented')
  assert.equal(new Set(slugs).size, slugs.length, 'Persona slugs must be unique')
  const definitions = [...personaSource.matchAll(/^  '([^']+)': \{([\s\S]*?)(?=^  '[^']+': \{|^\})/gm)]
  assert.deepEqual(definitions.map(match => match[1]), slugs, 'Each registered persona requires one definition')
  const documented = [...acceptance.matchAll(/^\| \x60([a-z-]+)\x60 \| \x60(\/home\/[a-z-]+)\x60 \|/gm)]
  assert.deepEqual(documented.map(match => match[1]), slugs, 'Acceptance must enumerate each real persona exactly once')
  for (const match of documented) assert.equal(match[2], '/home/' + match[1])

  const routes = [...manifest.matchAll(/^\| \x60(app\/(?:[^\x60\n]+\/)?page\.tsx)\x60 \|/gm)]
    .map(match => match[1].replace(/^app/, '').replace(/\/page\.tsx$/, '') || '/')
  function isManifestRoute(href) {
    const pathname = href.split(/[?#]/)[0]
    return routes.some(pattern => {
      const expected = pattern.split('/').filter(Boolean)
      const actual = pathname.split('/').filter(Boolean)
      return expected.length === actual.length && expected.every((segment, index) =>
        (/^\[[^\]]+\]$/.test(segment) && actual[index].length > 0) || segment === actual[index])
    })
  }
  for (const definition of definitions) {
    const slug = definition[1]
    const body = definition[2]
    assert.match(body, new RegExp("slug: '" + slug + "'"), 'Definition must match registry: ' + slug)
    assert.ok(body.includes("href: '/home/" + slug + "'"), 'Persona needs its own home: ' + slug)
    const links = [...body.matchAll(/\bhref: '([^']+)'/g)].map(match => match[1])
    assert.ok(links.length > 0, 'Persona requires at least one navigation link: ' + slug)
    for (const href of links) assert.ok(href.startsWith('/') && isManifestRoute(href), 'Invalid persona navigation: ' + slug + ' -> ' + href)
  }

  const personaPage = fs.readFileSync(path.join(process.cwd(), 'app/home/[persona]/page.tsx'), 'utf8')
  assert.match(personaPage, /if \(!isPersonaSlug\(slug\)\) notFound\(\)/, 'Unknown persona must 404')
  assert.match(personaPage, /if \(slug !== access\.persona\) redirect\('\/home'\)/, 'Cross-persona URL must redirect')
  assert.match(personaPage, /if \(!enabled\) redirect\('\/home\/unavailable'\)/, 'Disabled persona must redirect')
})
