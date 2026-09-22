import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const probe = resolve(root, 'scripts/probe-vercel-jdbc-bridge-poc.mjs')
const config = JSON.parse(fs.readFileSync(resolve(root, 'services/jdbc-bridge/vercel.json'), 'utf8'))
const workflow = fs.readFileSync(resolve(root, '.github/workflows/jdbc-bridge.yml'), 'utf8')

test('automatic Git deployments remain disabled for the PoC', () => {
  assert.equal(config.git?.deploymentEnabled, false)
})

test('all public routes are explicitly bound to the container service', () => {
  assert.equal(config.services?.jdbc?.runtime, 'container')
  assert.equal(config.services?.jdbc?.entrypoint, 'Dockerfile.vercel')
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: { service: 'jdbc' } }])
})

test('live probe fails closed when no PoC URL is supplied', () => {
  const env = { ...process.env }
  delete env.VERCEL_JDBC_BRIDGE_URL
  const run = spawnSync(process.execPath, [probe], { cwd: root, env, encoding: 'utf8' })
  assert.notEqual(run.status, 0)
  assert.match(`${run.stderr}${run.stdout}`, /VERCEL_JDBC_BRIDGE_URL is required/)
})

test('live probe rejects an invalid health-latency budget before network access', () => {
  const run = spawnSync(process.execPath, [probe], {
    cwd: root,
    env: { ...process.env, VERCEL_JDBC_BRIDGE_URL: 'https://example.invalid', VERCEL_JDBC_BRIDGE_MAX_HEALTH_MS: '20' },
    encoding: 'utf8',
  })
  assert.notEqual(run.status, 0)
  assert.match(`${run.stderr}${run.stdout}`, /must be a number >= 100/)
})

test('workflow cannot run live PoC probe on pull requests or ordinary pushes', () => {
  assert.match(workflow, /live-vercel-poc:[\s\S]*if: github\.event_name == 'workflow_dispatch' && inputs\.poc_url != ''/)
})

test('workflow contains no Vercel deployment command', () => {
  assert.doesNotMatch(workflow, /\bvercel\s+(deploy|--prod)\b/i)
})


test('live probe supports Vercel Deployment Protection automation bypass without logging the secret', () => {
  const source = fs.readFileSync(probe, 'utf8')
  assert.match(source, /VERCEL_AUTOMATION_BYPASS_SECRET/)
  assert.match(source, /x-vercel-protection-bypass/)
  assert.match(source, /x-vercel-set-bypass-cookie/)
  assert.doesNotMatch(source, /console\.log\([^\n]*protectionBypass[^\n]*\)/)
  assert.match(workflow, /VERCEL_AUTOMATION_BYPASS_SECRET:\s*\$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/)
})
