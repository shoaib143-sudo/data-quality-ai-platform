import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('app/login/page.tsx', 'utf8')

for (const marker of [
  'Secure workspace',
  'Welcome back',
  'Continue with Enterprise SSO',
  'Governed access',
  'aria-busy={busy}',
  "aria-label={showPassword ? 'Hide password' : 'Show password'}",
  'safeAuthReturnPath',
]) {
  assert.ok(source.includes(marker), `login experience missing required UX marker: ${marker}`)
}

assert.ok(source.includes('autoComplete="email"'), 'login email must preserve browser/password-manager metadata')
assert.ok(source.includes('autoComplete="current-password"'), 'login password must preserve browser/password-manager metadata')
assert.ok(source.includes('role="alert"'), 'login errors must remain announced')
assert.ok(source.includes('role="status"'), 'password-reset success must remain announced')
assert.ok(source.includes('type="button"') && source.includes('aria-pressed={showPassword}'), 'password visibility control must not submit the form')
assert.ok(source.includes('disabled={busy}'), 'both sign-in paths must share a busy-state interaction guard')
assert.ok(!source.includes('window.location.assign(searchParams'), 'login must never navigate directly from unvalidated search parameters')

console.log('Login UX experience contract passed.')
