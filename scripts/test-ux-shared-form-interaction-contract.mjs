import assert from 'node:assert/strict'
import fs from 'node:fs'

const files=[
  'components/governance/role-landing-page.tsx',
  'app/ai-insights/page.tsx',
  'app/datasets/dataset/[datasetId]/edit/page.tsx',
  'app/datasets/edit/[sourceId]/page.tsx',
  'app/login/page.tsx',
  'app/signup/page.tsx',
  'app/forgot-password/page.tsx',
  'app/reset-password/page.tsx',
]

for(const file of files){
  const source=fs.readFileSync(file,'utf8')
  for(const match of source.matchAll(/<button\b[^>]*>/g)){
    assert.ok(/\btype=/.test(match[0]), `${file} must give every button an explicit type: ${match[0]}`)
  }
}

const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(roleLanding.includes('<form action="/catalog" method="get"'), 'persona home search must remain a GET form')
assert.ok(roleLanding.includes('name="q" aria-label="Search DataNexus catalog"'), 'persona home search must retain a named, labelled query control')
assert.ok(roleLanding.includes('<button type="submit" className={`rounded-lg bg-blue-600'), 'persona home search CTA must remain an explicit submit button')
assert.ok(roleLanding.includes('<form method="get" action={homeHref}'), 'persona trend filters must remain a GET form')
for(const label of ['Data Domain','Dataset','Quality dimension','Time range']){
  assert.ok(roleLanding.includes(`aria-label="${label}"`), `persona trend filter must retain label: ${label}`)
}
assert.ok(roleLanding.includes('<button type="submit" className={`rounded-xl bg-blue-600'), 'persona trend Apply CTA must remain an explicit submit button')

const aiInsights=fs.readFileSync('app/ai-insights/page.tsx','utf8')
assert.ok(aiInsights.includes('method="get"'), 'AI Insights scope selector must remain a GET form')
assert.ok(aiInsights.includes('<select name="projectId"'), 'AI Insights project selector must remain named')
assert.ok(aiInsights.includes('<select name="datasetId"'), 'AI Insights dataset selector must remain named')
assert.ok(aiInsights.includes('<button type="submit"') && aiInsights.includes('Load AI evidence'), 'AI Insights evidence loader must remain an explicit submit CTA')

console.log('Shared UX form interaction contract passed.')
