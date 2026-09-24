import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=p=>fs.readFileSync(p,'utf8')

test('authentication failure states remain explicit and non-silent',()=>{
  const login=read('app/login/page.tsx')
  const signup=read('app/signup/page.tsx')
  const forgot=read('app/forgot-password/page.tsx')
  const reset=read('app/reset-password/page.tsx')
  assert.match(login,/role="alert"/)
  assert.match(signup,/role="alert"/)
  assert.match(forgot,/role="alert"/)
  assert.match(reset,/role="alert"/)
  assert.match(forgot,/COOLDOWN_MS = 60_000/)
  assert.match(forgot,/coolingDown/)
  assert.match(reset,/Password must be at least 8 characters/)
  assert.match(reset,/Passwords do not match/)
})

test('access-denied and unavailable states do not imply permission mutation',()=>{
  const denied=read('app/access-denied/page.tsx')
  const unavailable=read('app/home/unavailable/page.tsx')
  assert.match(denied,/has not changed any data or permissions/)
  assert.match(denied,/does not disclose the internal capability or policy rule/)
  assert.match(unavailable,/underlying permissions are unchanged/)
})

test('data-quality and observability grids degrade before dense desktop layouts',()=>{
  const dq=read('app/data-quality/page.tsx')
  const obs=read('app/observability/page.tsx')
  assert.match(dq,/sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5/)
  assert.match(dq,/md:grid-cols-2 2xl:grid-cols-4/)
  assert.match(obs,/sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6/)
})

test('AI recommendations remain advisory and approval boundaries stay visible',()=>{
  const insights=read('app/ai-insights/page.tsx')
  const runForm=read('app/agents/run-agent-form.tsx')
  const run=read('app/agents/runs/[runId]/page.tsx')
  assert.match(insights,/ADVISORY/)
  assert.match(insights,/Evidence used/)
  assert.match(runForm,/APPROVAL_REQUIRED/)
  assert.match(runForm,/NOT_AUTHORIZED/)
  assert.match(run,/Approval gates/)
  assert.match(run,/sideEffectingTools/)
})

test('coverage and design-system guards fail closed if key contracts disappear',()=>{
  const coverage=read('tests/ux-all-pages-coverage.test.mjs')
  const design=read('tests/ux-modern-design-system.test.mjs')
  assert.match(coverage,/missing page routes/)
  assert.match(design,/keyboard focus remains explicit/)
  assert.match(design,/mild neomorphic semantic surfaces/)
})


test('partial-source and no-evidence states remain explicit instead of silently collapsing',()=>{
  const inbox=read('app/inbox/page.tsx')
  const dq=read('app/data-quality/page.tsx')
  const agents=read('app/agents/page.tsx')
  const catalog=read('app/catalog/catalog-manager.tsx')
  const observability=read('app/observability/page.tsx')

  assert.match(inbox,/Some inbox sources could not be loaded/)
  assert.match(inbox,/Available evidence is still shown below/)
  assert.match(dq,/No completed profiling evidence is available yet/)
  assert.match(dq,/No persisted findings are available/)
  assert.match(dq,/No quality evidence yet/)
  assert.match(agents,/agent registry could not be loaded/)
  assert.match(agents,/No enabled agents are currently registered/)
  assert.match(catalog,/No governed data matches/)
  assert.match(catalog,/Clear search/)
  assert.match(observability,/No persisted observability alerts are currently available/)
})


test('async governance feedback is announced to assistive technology',()=>{
  const catalog=read('app/catalog/catalog-manager.tsx')
  const learning=read('app/admin/learning-cases/positive-learning-case-review-manager.tsx')
  assert.match(catalog,/role="status" aria-live="polite"/)
  assert.match(learning,/role="status" aria-live="polite"/)
  assert.match(learning,/role="alert"/)
})


test('admin membership controls and document evidence remain accessible at scale',()=>{
  const admin=read('app/admin/admin-manager.tsx')
  const documents=read('app/documents/page.tsx')
  assert.match(admin,/aria-label=\{`Role for \$\{member\.email\|\|member\.userId\}`\}/)
  assert.match(admin,/aria-label=\{`Remove \$\{member\.email\|\|member\.userId\}`\}/)
  assert.match(documents,/const CHUNKS_PER_PAGE=25/)
  assert.match(documents,/\.range\(rangeStart, rangeEnd\)/)
  assert.match(documents,/aria-label="Document chunk pages"/)
  assert.match(documents,/shown of \{totalChunks\} chunks/)
})


test('malformed UUID route inputs fail closed before database queries',()=>{
  const dataset360=read('app/catalog/dataset/[datasetId]/page.tsx')
  const profiling=read('app/profiling/explorer/page.tsx')
  assert.match(dataset360,/if\(!isUuid\(datasetId\)\)notFound\(\)/)
  assert.match(profiling,/if\(requestedRunId&&!isUuid\(requestedRunId\)\)notFound\(\)/)
  assert.match(dataset360,/\^\[0-9a-f\]\{8\}/)
  assert.match(profiling,/\^\[0-9a-f\]\{8\}/)
})
