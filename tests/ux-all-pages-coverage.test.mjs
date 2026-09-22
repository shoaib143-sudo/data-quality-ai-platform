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
    else if (entry.name === 'page.tsx') result.push(path.relative(process.cwd(),full).replaceAll('\\\\','/'))
  }
  return result
}

test('every app page is explicitly covered by the UX revalidation manifest', () => {
  const pages = collectPages(path.join(process.cwd(),'app')).sort()
  assert.ok(pages.length > 0)
  const missing = pages.filter(page => !manifest.includes('`' + page + '`'))
  assert.deepEqual(missing,[],`UX manifest is missing page routes: ${missing.join(', ')}`)
  assert.match(manifest,new RegExp('Total routes covered: \\*\\*' + pages.length + '\\*\\*'))
})

test('manifest records the shared modernized design constraints', () => {
  for (const marker of ['Inter','mild neomorphism','reduced dead space','progressive disclosure','Accessibility','object-centered 360']) {
    assert.ok(manifest.includes(marker),`Missing UX design marker: ${marker}`)
  }
})
