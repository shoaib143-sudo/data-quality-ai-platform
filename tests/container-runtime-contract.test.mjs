import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const nextConfig = fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
const dockerignore = fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8')

test('Next.js portable runtime uses standalone output', () => {
  assert.match(nextConfig, /output:\s*['"]standalone['"]/)
})

test('container builds the same Next.js source and runs standalone server', () => {
  assert.match(dockerfile, /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\//)
  assert.match(dockerfile, /ARG NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(dockerfile, /ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(dockerfile, /RUN test -n \"\$NEXT_PUBLIC_SUPABASE_URL\" && test -n \"\$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\" && pnpm build/)
  assert.match(dockerfile, /pnpm install --frozen-lockfile/)
  assert.match(dockerfile, /RUN pnpm build/)
  assert.match(dockerfile, /\/app\/\.next\/standalone/)
  assert.match(dockerfile, /\/app\/\.next\/static/)
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/)
  assert.match(dockerfile, /USER datanexus/)
  assert.match(dockerfile, /\/api\/health\/live/)
})

test('container build context excludes credentials and generated build output', () => {
  assert.match(dockerignore, /^\.env$/m)
  assert.match(dockerignore, /^\.env\.\*$/m)
  assert.match(dockerignore, /^\.next$/m)
  assert.match(dockerignore, /^node_modules$/m)
  assert.match(dockerignore, /^\.git$/m)
})
